/**
 * CustomizerEditor - Canva-Style Design Studio
 *
 * Refactored from original CustomizerEditor.jsx per spec:
 *  1. Manufacturing & printing validation logic REMOVED (FeasibilityWarning,
 *     PrintPreviewModal, ArtworkValidatorModal, technique-incompatibility checks).
 *  2. "Publish to Storefront" + "Save Design" flows KEPT intact (same API calls).
 *  3. CSS-only image editing: brightness, contrast, hue-rotate, saturation,
 *     opacity, blend-mode, drop-shadow - scoped to .cfs-root.
 *  4. Expanded product catalog with categories + external/custom base products.
 *  5. All API endpoints, Shopify Polaris modals (PublishToStorefrontModal,
 *     VersionComparisonModal), DB mutations, and global state remain untouched.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import PropTypes from 'prop-types';

// Polaris modals we still need (publish + version history)
import PublishToStorefrontModal from '../components/PublishToStorefrontModal';
import VersionComparisonModal from '../components/VersionComparisonModal';
import DefaultSvgGraphic, { STICKER_CATEGORIES, STICKER_CATALOG } from '../components/DefaultSvgGraphic';

// Services / utilities - untouched
import api from '../services/api';
import { createProductArtwork } from '../utils/createProductArtwork';
import { getProductPrintArea } from '../utils/productPrintAreas';

// Scoped studio CSS (no global impact)
import './CanvasStudio.css';

// Mockup images
import whiteTshirtImg from '../assets/mockups/white_tshirt.jpg';
import blackTshirtImg from '../assets/mockups/black_tshirt.jpg';
import hoodieImg from '../assets/mockups/hoodie.jpg';
import mugImg from '../assets/mockups/mug.jpg';
import phoneCaseImg from '../assets/mockups/phone_case.jpg';

const MOCKUP_ASSET_MAP = {
  tshirt: whiteTshirtImg,
  hoodie: hoodieImg,
  mug: mugImg,
  phone_case: phoneCaseImg,
};

// 
// Static Data
// 

/** All built-in catalog products. External / non-store products can be added
 *  here or passed in via storeProducts prop. */
const BUILT_IN_PRODUCTS = [
  //  Apparel 
  {
    id: 'tshirt',
    category: 'Apparel',
    name: 'Classic Tee',
    subtitle: 'Unisex 100% Cotton',
    price: '$24.99',
    colors: ['#ffffff', '#18181b', '#1e3a8a', '#991b1b', '#374151'],
    colorNames: ['White', 'Black', 'Navy', 'Crimson', 'Charcoal'],
    image: whiteTshirtImg,
    darkImage: blackTshirtImg,
    compatibleTechniques: ['dtg', 'screen_print', 'embroidery'],
  },
  {
    id: 'hoodie',
    category: 'Apparel',
    name: 'Premium Hoodie',
    subtitle: 'Unisex French Terry',
    price: '$48.00',
    colors: ['#ffffff', '#18181b', '#475569', '#15803d'],
    colorNames: ['White', 'Black', 'Heather Grey', 'Forest Green'],
    image: hoodieImg,
    compatibleTechniques: ['embroidery', 'dtg'],
  },
  {
    id: 'crop_tee',
    category: 'Apparel',
    name: 'Crop Tee',
    subtitle: "Women's Fitted Crop",
    price: '$22.99',
    colors: ['#ffffff', '#fce7f3', '#18181b', '#7c3aed'],
    colorNames: ['White', 'Pink Blush', 'Black', 'Violet'],
    image: whiteTshirtImg,
    darkImage: blackTshirtImg,
    compatibleTechniques: ['dtg', 'screen_print'],
  },
  {
    id: 'longsleeve',
    category: 'Apparel',
    name: 'Long-Sleeve Tee',
    subtitle: 'Unisex Thermal Knit',
    price: '$32.00',
    colors: ['#ffffff', '#18181b', '#1e3a8a'],
    colorNames: ['White', 'Black', 'Navy'],
    image: whiteTshirtImg,
    darkImage: blackTshirtImg,
    compatibleTechniques: ['dtg', 'screen_print'],
  },
  //  Drinkware 
  {
    id: 'mug',
    category: 'Drinkware',
    name: 'Ceramic Mug',
    subtitle: '15oz Matte Stoneware',
    price: '$18.50',
    colors: ['#ffffff', '#18181b', '#0284c7'],
    colorNames: ['White', 'Matte Black', 'Cobalt Blue'],
    image: mugImg,
    compatibleTechniques: ['laser', 'uv_print'],
  },
  {
    id: 'travel_mug',
    category: 'Drinkware',
    name: 'Travel Mug',
    subtitle: '20oz Stainless Steel',
    price: '$28.00',
    colors: ['#d1d5db', '#18181b', '#7c3aed'],
    colorNames: ['Silver', 'Matte Black', 'Royal Purple'],
    image: mugImg,
    compatibleTechniques: ['laser', 'uv_print'],
  },
  {
    id: 'tumbler',
    category: 'Drinkware',
    name: '40oz Tumbler',
    subtitle: 'Insulated Stainless',
    price: '$34.00',
    colors: ['#d1d5db', '#18181b', '#dc2626'],
    colorNames: ['Silver', 'Matte Black', 'Red'],
    image: mugImg,
    compatibleTechniques: ['laser'],
  },
  //  Accessories 
  {
    id: 'phone_case',
    category: 'Accessories',
    name: 'Tough Phone Case',
    subtitle: 'Dual-Layer Impact Polycarbonate',
    price: '$22.00',
    colors: ['#ffffff', '#18181b', '#d97706'],
    colorNames: ['White', 'Black', 'Amber'],
    image: phoneCaseImg,
    compatibleTechniques: ['uv_print'],
  },
  {
    id: 'tote_bag',
    category: 'Accessories',
    name: 'Canvas Tote Bag',
    subtitle: '15L Natural Canvas',
    price: '$19.00',
    colors: ['#f3e8d0', '#18181b'],
    colorNames: ['Natural', 'Black'],
    image: whiteTshirtImg,
    compatibleTechniques: ['screen_print', 'dtg'],
  },
  {
    id: 'cap',
    category: 'Accessories',
    name: 'Snapback Cap',
    subtitle: 'Flat Brim, Adjustable',
    price: '$26.00',
    colors: ['#ffffff', '#18181b', '#1e3a8a'],
    colorNames: ['White', 'Black', 'Navy'],
    image: whiteTshirtImg,
    darkImage: blackTshirtImg,
    compatibleTechniques: ['embroidery'],
  },
  //  Home & Decor 
  {
    id: 'throw_pillow',
    category: 'Home & Decor',
    name: 'Throw Pillow',
    subtitle: '18-18 Polyester Cover',
    price: '$29.00',
    colors: ['#ffffff', '#18181b', '#f59e0b'],
    colorNames: ['White', 'Black', 'Amber'],
    image: whiteTshirtImg,
    compatibleTechniques: ['dtg'],
  },
  {
    id: 'framed_poster',
    category: 'Home & Decor',
    name: 'Framed Art Print',
    subtitle: 'Giclee on Archival Paper',
    price: '$44.00',
    colors: ['#ffffff'],
    colorNames: ['White'],
    image: whiteTshirtImg,
    compatibleTechniques: ['dtg'],
  },
  //  Stationery 
  {
    id: 'notebook',
    category: 'Stationery',
    name: 'Hardcover Notebook',
    subtitle: 'A5, 160 pages',
    price: '$16.00',
    colors: ['#ffffff', '#18181b', '#0284c7'],
    colorNames: ['White', 'Black', 'Blue'],
    image: whiteTshirtImg,
    compatibleTechniques: ['uv_print'],
  },
  //  Custom / External 
  {
    id: '__custom__',
    category: 'Custom',
    name: '+ Add Custom Product',
    subtitle: 'Link or upload your own base product',
    price: '',
    colors: ['#ffffff'],
    colorNames: ['Default'],
    image: whiteTshirtImg,
    compatibleTechniques: ['dtg', 'uv_print', 'screen_print', 'laser', 'embroidery'],
  },
];

export const FONT_CATEGORIES = [
  {
    category: 'Clean & Modern Sans-Serif',
    fonts: [
      { label: 'Poppins', value: 'Poppins', fallback: 'sans-serif' },
      { label: 'Inter', value: 'Inter', fallback: 'sans-serif' },
      { label: 'Montserrat', value: 'Montserrat', fallback: 'sans-serif' },
      { label: 'Roboto', value: 'Roboto', fallback: 'sans-serif' },
      { label: 'Open Sans', value: 'Open Sans', fallback: 'sans-serif' },
      { label: 'Lato', value: 'Lato', fallback: 'sans-serif' },
      { label: 'Raleway', value: 'Raleway', fallback: 'sans-serif' },
      { label: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans', fallback: 'sans-serif' },
      { label: 'Kanit', value: 'Kanit', fallback: 'sans-serif' },
      { label: 'Syne', value: 'Syne', fallback: 'sans-serif' },
    ],
  },
  {
    category: 'Bold Display & Streetwear',
    fonts: [
      { label: 'Bebas Neue', value: 'Bebas Neue', fallback: 'sans-serif' },
      { label: 'Oswald', value: 'Oswald', fallback: 'sans-serif' },
      { label: 'Anton', value: 'Anton', fallback: 'sans-serif' },
      { label: 'Archivo Black', value: 'Archivo Black', fallback: 'sans-serif' },
      { label: 'Righteous', value: 'Righteous', fallback: 'cursive' },
      { label: 'Bangers', value: 'Bangers', fallback: 'cursive' },
    ],
  },
  {
    category: 'Handwriting & Script',
    fonts: [
      { label: 'Pacifico', value: 'Pacifico', fallback: 'cursive' },
      { label: 'Dancing Script', value: 'Dancing Script', fallback: 'cursive' },
      { label: 'Great Vibes', value: 'Great Vibes', fallback: 'cursive' },
      { label: 'Satisfy', value: 'Satisfy', fallback: 'cursive' },
      { label: 'Caveat', value: 'Caveat', fallback: 'cursive' },
      { label: 'Sacramento', value: 'Sacramento', fallback: 'cursive' },
      { label: 'Permanent Marker', value: 'Permanent Marker', fallback: 'cursive' },
      { label: 'Yellowtail', value: 'Yellowtail', fallback: 'cursive' },
      { label: 'Courgette', value: 'Courgette', fallback: 'cursive' },
      { label: 'Kalam', value: 'Kalam', fallback: 'cursive' },
    ],
  },
  {
    category: 'Serif & Luxury',
    fonts: [
      { label: 'Playfair Display', value: 'Playfair Display', fallback: 'serif' },
      { label: 'Cinzel', value: 'Cinzel', fallback: 'serif' },
      { label: 'Merriweather', value: 'Merriweather', fallback: 'serif' },
      { label: 'Cormorant Garamond', value: 'Cormorant Garamond', fallback: 'serif' },
      { label: 'Abril Fatface', value: 'Abril Fatface', fallback: 'serif' },
      { label: 'DM Serif Display', value: 'DM Serif Display', fallback: 'serif' },
      { label: 'Prata', value: 'Prata', fallback: 'serif' },
      { label: 'Lora', value: 'Lora', fallback: 'serif' },
    ],
  },
  {
    category: 'Retro & Novelty',
    fonts: [
      { label: 'Lobster', value: 'Lobster', fallback: 'cursive' },
      { label: 'Special Elite', value: 'Special Elite', fallback: 'cursive' },
      { label: 'Rye', value: 'Rye', fallback: 'serif' },
      { label: 'Creepster', value: 'Creepster', fallback: 'cursive' },
      { label: 'Press Start 2P', value: 'Press Start 2P', fallback: 'monospace' },
      { label: 'Monoton', value: 'Monoton', fallback: 'cursive' },
    ],
  },
];

export const FONTS = FONT_CATEGORIES.flatMap((c) => c.fonts);

export const getFontFallback = (fontName) => {
  const match = FONTS.find((f) => f.value.toLowerCase() === String(fontName || '').toLowerCase());
  return match?.fallback || 'sans-serif';
};

const COLOR_PALETTE = [
  { label: 'Jet Black', hex: '#111827' },
  { label: 'Pure White', hex: '#ffffff' },
  { label: 'Sunset Orange', hex: '#f97316' },
  { label: 'Ocean Blue', hex: '#0284c7' },
  { label: 'Indigo', hex: '#6366f1' },
  { label: 'Teal', hex: '#0d9488' },
  { label: 'Ruby Red', hex: '#e11d48' },
  { label: 'Gold', hex: '#d97706' },
  { label: 'Lime', hex: '#84cc16' },
  { label: 'Pink', hex: '#ec4899' },
  { label: 'Cyan', hex: '#06b6d4' },
  { label: 'Violet', hex: '#7c3aed' },
];

const EFFECTS = [
  { id: 'none', label: 'Clean' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'outline', label: 'Outline' },
  { id: 'curve', label: 'Curve' },
];

const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
  'hue', 'saturation', 'color', 'luminosity',
];

const TEMPLATE_PRESETS = [
  { title: 'Good Vibes', category: 'Lifestyle', text: 'GOOD VIBES' },
  { title: 'Mountain Adventure', category: 'Outdoors', text: 'MOUNTAIN ADVENTURE' },
  { title: 'Beach Sunset', category: 'Travel', text: 'BEACH SUNSET' },
  { title: 'Stay Wild', category: 'Illustration', text: 'STAY WILD' },
  { title: 'Your Brand', category: 'Branding', text: 'YOUR BRAND' },
  { title: 'Happy Birthday', category: 'Celebration', text: 'HAPPY BIRTHDAY' },
  { title: 'Made With Love', category: 'Lifestyle', text: 'MADE WITH LOVE' },
  { title: 'Pet Lover', category: 'Pets', text: 'PET LOVER' },
  { title: 'Merry & Bright', category: 'Seasonal', text: 'MERRY & BRIGHT' },
  { title: 'Hello 2026', category: 'Seasonal', text: 'HELLO 2026' },
];

const isBuiltInTemplate = (name) => Boolean(name && TEMPLATE_PRESETS.some((t) => t.title.toLowerCase() === String(name).toLowerCase()));

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// 
// Helper: product option defaults
// 
const getProductOptions = (product) => {
  if (product?.storeProductId) return product.options || [];
  return [
    { name: 'Color', values: product?.colorNames || ['Default'] },
    { name: 'Size', values: SIZES },
  ];
};

const getProductOptionDefaults = (product) =>
  Object.fromEntries(
    getProductOptions(product)
      .filter((o) => o.values?.length)
      .map((o) => {
        const first = product?.variants?.[0]?.selectedOptions?.find(
          (s) => s.name === o.name,
        )?.value;
        const def = first && o.values.includes(first)
          ? first
          : o.name === 'Size' && o.values.includes('L')
            ? 'L'
            : o.values[0];
        return [o.name, def];
      }),
  );

// 
// Helper: version revision mapper (unchanged from original)
// 
const mapRevisionToVersion = (revision) => {
  const state = revision.canvasState;
  return {
    id: revision._id,
    version: revision.version,
    productId: revision.productId,
    versionName: `Version ${revision.version}`,
    date: (() => {
      const d = new Date(revision.savedAt || revision.createdAt);
      return Number.isNaN(d.getTime())
        ? 'Date unavailable'
        : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    })(),
    notes: revision.changeNote || '',
    thumbnailUrl: revision.thumbnailUrl || null,
    state: state ? {
      ...state,
      customText: state.customText ?? state.text,
      selectedFont: state.selectedFont ?? state.font,
      textColor: state.textColor ?? state.color,
      selectedEffect: state.selectedEffect ?? state.effect,
      productId: state.productId || revision.productId,
      productName: state.productName || state.productType ||
        BUILT_IN_PRODUCTS.find((p) => p.id === revision.productId)?.name || revision.productId,
    } : undefined,
  };
};

// 
// Sub-components
// 

/** Minimal range slider with label + value readout */
function CfsSlider({ label, value, onChange, min = 0, max = 100, step = 1, unit = '' }) {
  return (
    <div className="cfs-slider-row">
      <div className="cfs-slider-label">
        <span className="cfs-text-sm">{label}</span>
        <span className="cfs-slider-value">{value}{unit}</span>
      </div>
      <input
        type="range"
        className="cfs-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

CfsSlider.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  unit: PropTypes.string,
};

/** Toast notification */
function CfsToast({ toasts, onDismiss }) {
  return (
    <div className="cfs-toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`cfs-toast cfs-toast-${t.type || 'info'}`}
          onClick={() => onDismiss(t.id)}
        >
          <div className="cfs-toast-icon">
            {t.type === 'success' ? '...' : t.type === 'error' ? '' : ''}
          </div>
          <div className="cfs-toast-body">
            {t.title && <div className="cfs-toast-title">{t.title}</div>}
            <div className="cfs-toast-msg">{t.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

CfsToast.propTypes = {
  toasts: PropTypes.array.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

// 
// Canvas Stage - CSS-only design preview with full image editing controls
// 
function CanvasStage({
  activeProduct,
  activeProductImage,
  selectedColorIndex,
  customText,
  fontFamily,
  textColor,
  isBold,
  isItalic,
  isUnderline,
  alignment,
  effect,
  imageScale,
  imageX,
  imageY,
  imageRotation,
  textScale,
  textX,
  textY,
  textRotation,
  uploadedImageUrl,
  uploadedFileName,
  uploadedImages = [],
  selectedImageId = null,
  additionalTextLayers,
  additionalGraphicLayers,
  // CSS image filter controls
  imgBrightness,
  imgContrast,
  imgSaturation,
  imgHueRotate,
  imgOpacity,
  imgBlendMode,
  imgDropShadow,
  showGuides,
  canvasWidth,
  canvasHeight,
}) {
  const printArea = getProductPrintArea(activeProduct);
  const productColor = activeProduct.colors[selectedColorIndex];
  const colorName = activeProduct.colorNames[selectedColorIndex];

  const colorStr = (productColor || '').toLowerCase();
  const colorNameStr = (colorName || '').toLowerCase();
  const isDark =
    colorStr === '#18181b' || colorStr === '#111827' || colorStr === '#000000' ||
    colorStr === '#374151' || colorNameStr.includes('black') ||
    colorNameStr.includes('charcoal') || colorNameStr.includes('dark');
  const isNavy = colorStr === '#1e3a8a' || colorNameStr.includes('navy');
  const isCrimson = colorStr === '#991b1b' || colorNameStr.includes('crimson') || colorNameStr.includes('red');
  const isForestGreen = colorStr === '#15803d' || colorNameStr.includes('green');

  // Which mockup image to use
  const rawId = (activeProduct.id || '').toLowerCase();
  let baseMockup = activeProductImage || activeProduct.image || whiteTshirtImg;
  if (!activeProduct.storeProductId) {
    if (rawId === 'tshirt' || rawId.includes('tee') || rawId.includes('shirt') || rawId.includes('longsleeve')) {
      baseMockup = isDark ? blackTshirtImg : whiteTshirtImg;
    } else if (rawId === 'hoodie' || rawId.includes('hoodie')) {
      baseMockup = hoodieImg;
    } else if (rawId === 'mug' || rawId.includes('mug') || rawId.includes('travel_mug') || rawId.includes('tumbler')) {
      baseMockup = mugImg;
    } else if (rawId === 'phone_case') {
      baseMockup = phoneCaseImg;
    }
  }

  // Effective text color on dark garments
  let effTextColor = textColor;
  if ((isDark || isNavy || isCrimson || isForestGreen) && (textColor === '#111827' || textColor === '#18181b')) {
    effTextColor = '#ffffff';
  }

  // Text effect CSS
  let textShadowCss = 'none';
  let textStrokeCss = 'transparent';
  if (effect === 'shadow') {
    textShadowCss = isDark
      ? '0 3px 8px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)'
      : '0 3px 6px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.2)';
  } else if (effect === 'outline') {
    textStrokeCss = isDark ? '#ffffff' : '#111827';
  }

  const zone = {
    top: printArea.top * 100,
    left: printArea.left * 100,
    width: printArea.width * 100,
    height: printArea.height * 100,
  };

  // CSS filter string for uploaded image
  const shadowPx = imgDropShadow > 0 ? ` drop-shadow(0 ${imgDropShadow}px ${imgDropShadow * 2}px rgba(0,0,0,0.5))` : '';
  const imgFilter = `brightness(${imgBrightness / 100}) contrast(${imgContrast / 100}) saturate(${imgSaturation / 100}) hue-rotate(${imgHueRotate}deg)${shadowPx}`;

  const displayText = (customText || '').trim();
  const hasImage = Boolean(uploadedImageUrl || uploadedFileName || (uploadedImages && uploadedImages.length > 0));

  return (
    <div
      className="cfs-canvas-stage"
      style={{ width: canvasWidth, height: canvasHeight, backgroundColor: '#e5e7eb' }}
    >
      {/* Base product image */}
      <img
        src={baseMockup}
        alt={activeProduct.name}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'center', pointerEvents: 'none',
        }}
        loading="lazy"
      />

      {/* Print zone guide */}
      {showGuides && (
        <div
          className="cfs-print-zone"
          style={{
            top: `${zone.top}%`, left: `${zone.left}%`,
            width: `${zone.width}%`, height: `${zone.height}%`,
          }}
        />
      )}

      {/* Design Print Area */}
      <div
        className="cfs-design-layer"
        style={{
          top: `${zone.top}%`, left: `${zone.left}%`,
          width: `${zone.width}%`, height: `${zone.height}%`,
          position: 'absolute',
        }}
      >
        {/* Uploaded image layers - show ALL uploaded images simultaneously */}
        {uploadedImages && uploadedImages.length > 0 ? (
          uploadedImages
            .filter((img) => img.visible !== false && img.url)
            .map((img) => {
              const isSelected = img.id === selectedImageId || (uploadedImages.length === 1 && !selectedImageId);
              const curX = isSelected ? imageX : (img.x ?? 0);
              const curY = isSelected ? imageY : (img.y ?? 0);
              const curScale = isSelected ? imageScale : (img.scale ?? 75);
              const curRotation = isSelected ? imageRotation : (img.rotation ?? 0);
              const curBlend = isSelected ? imgBlendMode : (img.blendMode || 'normal');
              const curOpacity = isSelected ? imgOpacity : (img.opacity ?? 100);

              const b = isSelected ? imgBrightness : (img.brightness ?? 100);
              const c = isSelected ? imgContrast : (img.contrast ?? 100);
              const s = isSelected ? imgSaturation : (img.saturation ?? 100);
              const h = isSelected ? imgHueRotate : (img.hueRotate ?? 0);
              const ds = isSelected ? imgDropShadow : (img.dropShadow ?? 0);
              const shadowStr = ds > 0 ? ` drop-shadow(0 ${ds}px ${ds * 2}px rgba(0,0,0,0.5))` : '';
              const thisFilter = `brightness(${b / 100}) contrast(${c / 100}) saturate(${s / 100}) hue-rotate(${h}deg)${shadowStr}`;

              return (
                <div
                  key={img.id}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${curX}px), calc(-50% + ${curY}px)) rotate(${curRotation}deg) scale(${curScale / 100})`,
                    transformOrigin: 'center center',
                    mixBlendMode: curBlend,
                    opacity: curOpacity / 100,
                    filter: thisFilter,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    maxWidth: '80%',
                    maxHeight: '80%',
                  }}
                >
                  <img
                    src={img.url}
                    alt={img.name || 'Design artwork'}
                    className="cfs-design-image"
                    style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                </div>
              );
            })
        ) : (
          uploadedImageUrl && (
            <div
              className="cfs-design-image-wrap"
              style={{
                transform: `translate(${imageX}px, ${imageY}px) rotate(${imageRotation}deg) scale(${imageScale / 100})`,
                mixBlendMode: imgBlendMode,
                opacity: imgOpacity / 100,
                filter: imgFilter,
                position: 'relative',
                width: '80%',
                height: '80%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={uploadedImageUrl}
                alt="Design artwork"
                className="cfs-design-image"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          )
        )}

        {/* Graphic placeholder (template) */}
        {!uploadedImageUrl && (!uploadedImages || uploadedImages.length === 0) && uploadedFileName && uploadedFileName !== 'good_vibes_sun.svg' && (
          <div
            style={{
              transform: `translate(${imageX}px, ${imageY}px) rotate(${imageRotation}deg) scale(${imageScale / 100})`,
              mixBlendMode: imgBlendMode,
              opacity: imgOpacity / 100,
              filter: imgFilter,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DefaultSvgGraphic name={uploadedFileName} color={effTextColor} size={90} />
          </div>
        )}

        {/* Main text layer */}
        {displayText && (
          <div
            className="cfs-design-text"
            style={{
              fontFamily: `'${fontFamily}', ${getFontFallback(fontFamily)}`,
              fontSize: `${(textScale / 100) * 28}px`,
              fontWeight: isBold ? 800 : 400,
              fontStyle: isItalic ? 'italic' : 'normal',
              textDecoration: isUnderline ? 'underline' : 'none',
              textAlign: alignment,
              color: effTextColor,
              textShadow: textShadowCss,
              WebkitTextStroke: effect === 'outline' ? `1.2px ${textStrokeCss}` : undefined,
              transform: `translate(${textX}px, ${textY}px) rotate(${textRotation}deg)${effect === 'curve' ? ' skewX(-4deg)' : ''}`,
              letterSpacing: effect === 'curve' ? '0.12em' : '0.06em',
              lineHeight: 1.15,
              width: '100%',
              position: 'absolute',
            }}
          >
            {displayText}
          </div>
        )}

        {/* Additional graphic layers */}
        {additionalGraphicLayers
          .filter((l) => l.visible !== false)
          .map((layer) => (

            <div
              key={layer.id}
              style={{
                position: 'absolute',
                transform: `translate(${layer.x}px, ${layer.y}px) rotate(${layer.rotation}deg) scale(${layer.scale / 100})`,
              }}
            >
              <DefaultSvgGraphic
                name={layer.name}
                color={(isDark || isNavy || isCrimson || isForestGreen) && (layer.color === '#111827' || !layer.color) ? '#ffffff' : (layer.color || effTextColor)}
                size={Math.round(75 * ((layer.scale || 60) / 60))}
              />
            </div>
          ))}

        {/* Additional text layers */}
        {additionalTextLayers
          .filter((l) => l.visible !== false)
          .map((layer) => (
            <div
              key={layer.id}
              className="cfs-design-text"
              style={{
                fontFamily: `'${layer.font}', ${getFontFallback(layer.font)}`,
                fontSize: `${(layer.scale / 100) * 18}px`,
                fontWeight: layer.bold ? 800 : 400,
                color: layer.color,
                transform: `translate(${layer.x}px, ${layer.y}px) rotate(${layer.rotation}deg)`,
                width: '100%',
                textAlign: 'center',
              }}
            >
              {layer.text}
            </div>
          ))}
      </div>
    </div>
  );
}

CanvasStage.propTypes = {
  activeProduct: PropTypes.object.isRequired,
  selectedColorIndex: PropTypes.number.isRequired,
  customText: PropTypes.string,
  fontFamily: PropTypes.string,
  textColor: PropTypes.string,
  isBold: PropTypes.bool,
  isItalic: PropTypes.bool,
  isUnderline: PropTypes.bool,
  alignment: PropTypes.string,
  effect: PropTypes.string,
  imageScale: PropTypes.number,
  imageX: PropTypes.number,
  imageY: PropTypes.number,
  imageRotation: PropTypes.number,
  textScale: PropTypes.number,
  textX: PropTypes.number,
  textY: PropTypes.number,
  textRotation: PropTypes.number,
  uploadedImageUrl: PropTypes.string,
  uploadedFileName: PropTypes.string,
  uploadedImages: PropTypes.array,
  selectedImageId: PropTypes.string,
  additionalTextLayers: PropTypes.array,
  additionalGraphicLayers: PropTypes.array,
  imgBrightness: PropTypes.number,
  imgContrast: PropTypes.number,
  imgSaturation: PropTypes.number,
  imgHueRotate: PropTypes.number,
  imgOpacity: PropTypes.number,
  imgBlendMode: PropTypes.string,
  imgDropShadow: PropTypes.number,
  showGuides: PropTypes.bool,
  canvasWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  canvasHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

// -----------------------------------------------------------------------------
// Pure ASCII SVG Icon Components
// -----------------------------------------------------------------------------
function IconTemplates({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

function IconText({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function IconUpload({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconAdjust({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function IconElements({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconLayers({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconProducts({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconSave({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function IconPublish({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function IconAlignLeft({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="21" y1="6" x2="3" y2="6" /><line x1="15" y1="12" x2="3" y2="12" /><line x1="17" y1="18" x2="3" y2="18" />
    </svg>
  );
}

function IconAlignCenter({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="6" /><line x1="21" y1="12" x2="3" y2="12" /><line x1="18" y1="18" x2="6" y2="18" />
    </svg>
  );
}

function IconAlignRight({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="12" x2="9" y2="12" /><line x1="21" y1="18" x2="7" y2="18" />
    </svg>
  );
}

function IconArrowUp({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function IconArrowDown({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconArrowLeft({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconArrowRight({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconCenterTarget({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconTrash({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function IconPlus({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// TOOL IDs
// -----------------------------------------------------------------------------
const TOOL = {
  TEMPLATES: 'templates',
  TEXT: 'text',
  UPLOAD: 'upload',
  IMAGE_ADJUST: 'image_adjust',
  ELEMENTS: 'elements',
  LAYERS: 'layers',
  PRODUCTS: 'products',
};

const TOOL_BUTTONS = [
  { id: TOOL.TEMPLATES, label: 'Templates' },
  { id: TOOL.TEXT, label: 'Text' },
  { id: TOOL.UPLOAD, label: 'Upload' },
  { id: TOOL.IMAGE_ADJUST, label: 'Adjust' },
  { id: TOOL.ELEMENTS, label: 'Elements' },
  { id: TOOL.LAYERS, label: 'Layers' },
  { id: TOOL.PRODUCTS, label: 'Products' },
];

function getToolIcon(id) {
  switch (id) {
    case TOOL.TEMPLATES: return <IconTemplates />;
    case TOOL.TEXT: return <IconText />;
    case TOOL.UPLOAD: return <IconUpload />;
    case TOOL.IMAGE_ADJUST: return <IconAdjust />;
    case TOOL.ELEMENTS: return <IconElements />;
    case TOOL.LAYERS: return <IconLayers />;
    case TOOL.PRODUCTS: return <IconProducts />;
    default: return null;
  }
}

// 
// Main Component
// 
export default function CustomizerEditor({ storeProducts = [], catalogError = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [customProducts, setCustomProducts] = useState([]);

  // Merge store products + user-created custom products + built-in catalog (all categories accessible)
  const products = useMemo(() => {
    const list = [];
    const seenIds = new Set();
    const addProd = (p) => {
      if (p && p.id && !seenIds.has(p.id)) {
        seenIds.add(p.id);
        const resolvedImage = p.image || MOCKUP_ASSET_MAP[p.mockupType] || whiteTshirtImg;
        list.push({ ...p, image: resolvedImage });
      }
    };
    if (Array.isArray(storeProducts)) {
      storeProducts.forEach(addProd);
    }
    customProducts.forEach(addProd);
    BUILT_IN_PRODUCTS.forEach(addProd);
    return list;
  }, [storeProducts, customProducts]);

  //  Product / Category Selection 
  const [selectedCategory, setSelectedCategory] = useState('all');
  const productCategories = useMemo(
    () => ['all', ...new Set(products.map((p) => p.category || p.productType || 'Other'))
      .values()].sort((a, b) => a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)),
    [products],
  );

  const filteredProducts = useMemo(
    () => products.filter((p) =>
      selectedCategory === 'all' ||
      (p.category || p.productType || 'Other') === selectedCategory,
    ),
    [products, selectedCategory],
  );

  const [selectedProductId, setSelectedProductId] = useState(() => products[0]?.id || 'tshirt');
  const [selectedOptionValues, setSelectedOptionValues] = useState(
    () => getProductOptionDefaults(products[0] || BUILT_IN_PRODUCTS[0]),
  );
  const [variantsByProductId, setVariantsByProductId] = useState({});
  const [variantsLoadingProductId, setVariantsLoadingProductId] = useState(null);
  const [variantsLoadError, setVariantsLoadError] = useState('');
  const variantsRequestIdRef = useRef(0);
  const variantsRequestsRef = useRef(new Map());

  const activeProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || products[0] || BUILT_IN_PRODUCTS[0],
    [products, selectedProductId],
  );
  const activeProductOptions = useMemo(() => getProductOptions(activeProduct), [activeProduct]);
  const productVariantMatrix = variantsByProductId[activeProduct.id];
  const productVariants = Array.isArray(productVariantMatrix)
    ? productVariantMatrix
    : activeProduct.variants || [];
  const colorOption = activeProductOptions.find((o) => /color|colour/i.test(o.name));
  const sizeOption = activeProductOptions.find((o) => /size/i.test(o.name));
  const selectedColorName = colorOption
    ? selectedOptionValues[colorOption.name] || colorOption.values[0]
    : activeProduct.colorNames?.[0] || 'Default';
  const selectedColorIndex = Math.max(0, (activeProduct.colorNames || []).indexOf(selectedColorName));
  const selectedSize = sizeOption
    ? selectedOptionValues[sizeOption.name] || sizeOption.values[0]
    : 'Default';
  const otherProductOptions = activeProductOptions.filter(
    (o) => o.name !== colorOption?.name && o.name !== sizeOption?.name,
  );
  const activeVariant = productVariants.find((v) =>
    activeProductOptions.every((o) =>
      v.selectedOptions?.some(
        (s) => s.name === o.name && s.value === (selectedOptionValues[o.name] || o.values[0]),
      ),
    ),
  );
  const variantMatrixLoaded = Array.isArray(productVariantMatrix);
  const variantSelectionValid =
    !activeProduct.storeProductId || (variantMatrixLoaded && Boolean(activeVariant));
  const activeProductImage = activeVariant?.image || activeProduct.image;
  const activePrintArea = getProductPrintArea(activeProduct);
  const selectedProductColor = activeProduct.colors[selectedColorIndex] || '';
  const selectedProductColorName = activeProduct.colorNames?.[selectedColorIndex] || '';
  const darkColorSelected = /^(?:#18181b|#111827|#000000)$/.test(selectedProductColor.toLowerCase()) ||
    /black|charcoal|navy|crimson|dark/i.test(selectedProductColorName);
  const publishMockupUrl = activeProduct.storeProductId
    ? (activeVariant?.image || activeProductImage)
    : (darkColorSelected && activeProduct.darkImage
      ? activeProduct.darkImage
      : activeProductImage || activeProduct.image);
  const defaultProductPrice = String(activeVariant?.price || activeProduct.price || '').replace(/[^0-9.]/g, '');

  const [customProductPrice, setCustomProductPrice] = useState(defaultProductPrice || '0.00');
  useEffect(() => {
    setCustomProductPrice(defaultProductPrice || '0.00');
  }, [activeProduct.id, activeVariant?.id, defaultProductPrice]);

  //  Custom product state (for __custom__ entry) 
  const [customProductName, setCustomProductName] = useState('');
  const [customProductUrl, setCustomProductUrl] = useState('');

  //  Tool / Inspector 
  // Dynamically load Google Fonts to guarantee 100% rendering in any container
  useEffect(() => {
    const FONT_LINK_ID = 'customforge-google-fonts';
    if (!document.getElementById(FONT_LINK_ID)) {
      const link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Anton&family=Archivo+Black&family=Bangers&family=Bebas+Neue&family=Caveat:wght@600;700&family=Cinzel:wght@600;700;800&family=Cormorant+Garamond:wght@600;700&family=Courgette&family=Creepster&family=DM+Serif+Display&family=Dancing+Script:wght@600;700&family=Great+Vibes&family=Inter:wght@300;400;500;600;700&family=Kalam:wght@700&family=Kanit:wght@500;700;800&family=Lato:wght@400;700&family=Lobster&family=Lora:wght@500;600;700&family=Merriweather:wght@400;700&family=Monoton&family=Montserrat:wght@400;600;700;800&family=Open+Sans:wght@400;600;700&family=Oswald:wght@500;600;700&family=Outfit:wght@400;600;700&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Poppins:wght@400;600;700;800&family=Prata&family=Press+Start+2P&family=Raleway:wght@400;600;700&family=Righteous&family=Roboto:wght@400;500;700&family=Rye&family=Sacramento&family=Satisfy&family=Special+Elite&family=Syne:wght@600;700;800&family=Yellowtail&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const [activeTool, setActiveTool] = useState(TOOL.TEXT);
  const [showGuides, setShowGuides] = useState(false);

  //  Text State 
  const [customText, setCustomText] = useState('Good Vibes');
  const [selectedFont, setSelectedFont] = useState('Poppins');
  const [textColor, setTextColor] = useState('#111827');
  const [isBold, setIsBold] = useState(true);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [alignment, setAlignment] = useState('center');
  const [selectedEffect, setSelectedEffect] = useState('curve');
  const [textScale, setTextScale] = useState(85);
  const [textX, setTextX] = useState(0);
  const [textY, setTextY] = useState(32);
  const [textRotation, setTextRotation] = useState(0);

  // Preload selected font into document.fonts
  useEffect(() => {
    if (selectedFont && document.fonts?.load) {
      document.fonts.load(`16px "${selectedFont}"`).catch(() => {});
    }
  }, [selectedFont]);

  //  Image / Artwork State 
  const [uploadedFileName, setUploadedFileName] = useState('good_vibes_sun.svg');
  const [uploadedFileSize, setUploadedFileSize] = useState('1.8 MB');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedStickerCat, setSelectedStickerCat] = useState('All');
  const [imageScale, setImageScale] = useState(90);
  const [imageX, setImageX] = useState(0);
  const [imageY, setImageY] = useState(-24);
  const [imageRotation, setImageRotation] = useState(0);

  //  CSS Image Filter Controls 
  const [imgBrightness, setImgBrightness] = useState(100);
  const [imgContrast, setImgContrast] = useState(100);
  const [imgSaturation, setImgSaturation] = useState(100);
  const [imgHueRotate, setImgHueRotate] = useState(0);
  const [imgOpacity, setImgOpacity] = useState(100);
  const [imgBlendMode, setImgBlendMode] = useState('normal');
  const [imgDropShadow, setImgDropShadow] = useState(0);

  //  Layers 
  const [additionalTextLayers, setAdditionalTextLayers] = useState([]);
  const [additionalGraphicLayers, setAdditionalGraphicLayers] = useState([]);

  //  Undo / Redo 
  const [history, setHistory] = useState([
    { text: 'Good Vibes', font: 'Poppins', color: '#111827', effect: 'curve' },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  //  Version History / Saving 
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [versionCompareOpen, setVersionCompareOpen] = useState(false);
  const [versionHistory, setVersionHistory] = useState([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState('');
  const designRecordsRef = useRef(new Map());
  const [historyModalProductId, setHistoryModalProductId] = useState(selectedProductId);
  const historyModalProductIdRef = useRef(selectedProductId);
  const historyRequestIdRef = useRef(0);
  historyModalProductIdRef.current = historyModalProductId;

  //  Publish 
  const [publishOpen, setPublishOpen] = useState(false);
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState('');
  const [collectionChoice, setCollectionChoice] = useState({ type: 'none' });
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectionNameError, setCollectionNameError] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  //  Toast system 
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((type, title, message) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // 
  // Product Selection
  // 
  const handleProductSelect = useCallback((prodId) => {
    setSelectedProductId(prodId);
    const product = products.find((p) => p.id === prodId);
    setSelectedOptionValues(getProductOptionDefaults(product));
    setVersionHistory([]);
    setVersionHistoryError('');
    if (product) setSelectedCategory(product.category || product.productType || 'Other');
  }, [products]);

  const loadProductVariants = useCallback((productId) => {
    const pending = variantsRequestsRef.current.get(productId);
    if (pending) return pending;
    const reqId = ++variantsRequestIdRef.current;
    setVariantsLoadingProductId(productId);
    setVariantsLoadError('');
    const req = (async () => {
      try {
        const res = await api.shopify.variants(productId);
        const data = res?.data;
        if (res?.success !== true || data?.productId !== productId || !Array.isArray(data.variants) || !data.variants.length) {
          throw new Error(res?.message || 'Shopify did not return a product variant matrix.');
        }
        setVariantsByProductId((cur) => ({ ...cur, [productId]: data.variants }));
        return data.variants;
      } catch (err) {
        if (reqId === variantsRequestIdRef.current) {
          setVariantsLoadError(err?.message || 'Unable to load Shopify product variants.');
        }
        throw err;
      } finally {
        if (reqId === variantsRequestIdRef.current) setVariantsLoadingProductId(null);
      }
    })();
    variantsRequestsRef.current.set(productId, req);
    return req.finally(() => {
      if (variantsRequestsRef.current.get(productId) === req) {
        variantsRequestsRef.current.delete(productId);
      }
    });
  }, []);

  useEffect(() => {
    if (!activeProduct.storeProductId || Array.isArray(variantsByProductId[activeProduct.id])) return;
    loadProductVariants(activeProduct.id).catch((e) => {
      console.error('[CustomizerEditor] Unable to load product variant matrix:', e);
    });
  }, [activeProduct.id, activeProduct.storeProductId, variantsByProductId, loadProductVariants]);

  const handleProductOptionChange = useCallback((name, value) => {
    setSelectedOptionValues((cur) => ({ ...cur, [name]: value }));
  }, []);

  // 
  // Image drop & upload handlers (Multiple images support)
  // 
  const dropzoneRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Returns uploadedImages with active image's live slider transforms merged in
  const getSyncedUploadedImages = useCallback(() => {
    if (!selectedImageId || uploadedImages.length === 0) return uploadedImages;
    return uploadedImages.map((img) =>
      img.id === selectedImageId
        ? {
            ...img,
            x: imageX,
            y: imageY,
            scale: imageScale,
            rotation: imageRotation,
            brightness: imgBrightness,
            contrast: imgContrast,
            saturation: imgSaturation,
            hueRotate: imgHueRotate,
            opacity: imgOpacity,
            blendMode: imgBlendMode,
            dropShadow: imgDropShadow,
          }
        : img
    );
  }, [selectedImageId, uploadedImages, imageX, imageY, imageScale, imageRotation, imgBrightness, imgContrast, imgSaturation, imgHueRotate, imgOpacity, imgBlendMode, imgDropShadow]);

  const addImageFile = useCallback((file) => {
    if (!file || !file.type?.startsWith('image/')) {
      addToast('error', 'Invalid File', 'Please upload an image file (PNG, JPG, SVG, WebP, etc.).');
      return;
    }
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const sizeStr = `${sizeMB} MB`;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const newId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      setUploadedImages((prev) => {
        const count = prev.length;
        const xOffsets = [0, 60, -60, 0, 70, -70];
        const yOffsets = [0, 0, 0, 60, -60, 60];
        const initX = xOffsets[count % xOffsets.length];
        const initY = yOffsets[count % yOffsets.length];

        const newImgItem = {
          id: newId,
          name: file.name,
          size: sizeStr,
          url: dataUrl,
          file,
          x: initX,
          y: initY,
          scale: 75,
          rotation: 0,
          visible: true,
          brightness: 100,
          contrast: 100,
          saturation: 100,
          hueRotate: 0,
          opacity: 100,
          blendMode: 'normal',
          dropShadow: 0,
        };

        // If an image was previously selected, save its live values
        const updated = prev.map((img) =>
          img.id === selectedImageId
            ? {
                ...img,
                x: imageX,
                y: imageY,
                scale: imageScale,
                rotation: imageRotation,
                brightness: imgBrightness,
                contrast: imgContrast,
                saturation: imgSaturation,
                hueRotate: imgHueRotate,
                opacity: imgOpacity,
                blendMode: imgBlendMode,
                dropShadow: imgDropShadow,
              }
            : img
        );

        return [...updated, newImgItem];
      });

      setSelectedImageId(newId);
      setUploadedImageUrl(dataUrl);
      setUploadedFileName(file.name);
      setUploadedFileSize(sizeStr);
      setUploadedFile(file);

      const count = uploadedImages.length;
      const xOffsets = [0, 60, -60, 0, 70, -70];
      const yOffsets = [0, 0, 0, 60, -60, 60];
      setImageX(xOffsets[count % xOffsets.length]);
      setImageY(yOffsets[count % yOffsets.length]);
      setImageScale(75);
      setImageRotation(0);
      setImgBrightness(100);
      setImgContrast(100);
      setImgSaturation(100);
      setImgHueRotate(0);
      setImgOpacity(100);
      setImgBlendMode('normal');
      setImgDropShadow(0);

      addToast('success', 'Artwork Added', `"${file.name}" added to product. All images are displayed!`);
    };
    reader.readAsDataURL(file);
  }, [selectedImageId, imageX, imageY, imageScale, imageRotation, imgBrightness, imgContrast, imgSaturation, imgHueRotate, imgOpacity, imgBlendMode, imgDropShadow, uploadedImages.length, addToast]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragActive(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragActive(false), []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    files.forEach((f) => addImageFile(f));
  }, [addImageFile]);

  const handleFileInput = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    files.forEach((f) => addImageFile(f));
    e.target.value = '';
  }, [addImageFile]);

  const handleSelectUploadedImage = useCallback((item) => {
    if (!item) return;
    // Save current active transforms to previous selected image
    if (selectedImageId && selectedImageId !== item.id) {
      setUploadedImages((prev) =>
        prev.map((img) =>
          img.id === selectedImageId
            ? {
                ...img,
                x: imageX,
                y: imageY,
                scale: imageScale,
                rotation: imageRotation,
                brightness: imgBrightness,
                contrast: imgContrast,
                saturation: imgSaturation,
                hueRotate: imgHueRotate,
                opacity: imgOpacity,
                blendMode: imgBlendMode,
                dropShadow: imgDropShadow,
              }
            : img
        )
      );
    }

    setSelectedImageId(item.id);
    setUploadedImageUrl(item.url);
    setUploadedFileName(item.name);
    setUploadedFileSize(item.size);
    setUploadedFile(item.file);

    setImageX(item.x ?? 0);
    setImageY(item.y ?? 0);
    setImageScale(item.scale ?? 75);
    setImageRotation(item.rotation ?? 0);
    setImgBrightness(item.brightness ?? 100);
    setImgContrast(item.contrast ?? 100);
    setImgSaturation(item.saturation ?? 100);
    setImgHueRotate(item.hueRotate ?? 0);
    setImgOpacity(item.opacity ?? 100);
    setImgBlendMode(item.blendMode || 'normal');
    setImgDropShadow(item.dropShadow ?? 0);

    addToast('info', 'Image Selected', `"${item.name}" is now active for editing.`);
  }, [selectedImageId, imageX, imageY, imageScale, imageRotation, imgBrightness, imgContrast, imgSaturation, imgHueRotate, imgOpacity, imgBlendMode, imgDropShadow, addToast]);

  const handleRemoveImage = useCallback(() => {
    if (uploadedImages.length === 0 && !uploadedImageUrl) {
      addToast('warning', 'No Image Selected', 'No image is currently on the product to remove.');
      return;
    }

    const targetId = selectedImageId || (uploadedImages.length > 0 ? uploadedImages[uploadedImages.length - 1].id : null);
    const targetItem = uploadedImages.find((img) => img.id === targetId);
    const removedName = targetItem?.name || uploadedFileName || 'Image';

    setUploadedImages((prev) => {
      const remaining = prev.filter((img) => img.id !== targetId);
      if (remaining.length > 0) {
        const nextActive = remaining[remaining.length - 1];
        setSelectedImageId(nextActive.id);
        setUploadedImageUrl(nextActive.url);
        setUploadedFileName(nextActive.name);
        setUploadedFileSize(nextActive.size);
        setUploadedFile(nextActive.file);
        setImageX(nextActive.x ?? 0);
        setImageY(nextActive.y ?? -20);
        setImageScale(nextActive.scale ?? 75);
        setImageRotation(nextActive.rotation ?? 0);
        setImgBrightness(nextActive.brightness ?? 100);
        setImgContrast(nextActive.contrast ?? 100);
        setImgSaturation(nextActive.saturation ?? 100);
        setImgHueRotate(nextActive.hueRotate ?? 0);
        setImgOpacity(nextActive.opacity ?? 100);
        setImgBlendMode(nextActive.blendMode || 'normal');
        setImgDropShadow(nextActive.dropShadow ?? 0);
      } else {
        setSelectedImageId(null);
        setUploadedImageUrl(null);
        setUploadedFile(null);
        if (!isBuiltInTemplate(uploadedFileName)) {
          setUploadedFileName(null);
          setUploadedFileSize(null);
        }
        setTextY(0);
      }
      return remaining;
    });

    addToast('info', 'Image Removed', `"${removedName}" removed from product.`);
  }, [selectedImageId, uploadedImages, uploadedImageUrl, uploadedFileName, addToast]);

  const handleDeleteUploadedImage = useCallback((imageId) => {
    const target = uploadedImages.find((img) => img.id === imageId);
    const removedName = target?.name || 'Image';
    setUploadedImages((prev) => {
      const remaining = prev.filter((img) => img.id !== imageId);
      if (selectedImageId === imageId) {
        if (remaining.length > 0) {
          const nextActive = remaining[remaining.length - 1];
          setSelectedImageId(nextActive.id);
          setUploadedImageUrl(nextActive.url);
          setUploadedFileName(nextActive.name);
          setUploadedFileSize(nextActive.size);
          setUploadedFile(nextActive.file);
          setImageX(nextActive.x ?? 0);
          setImageY(nextActive.y ?? -20);
          setImageScale(nextActive.scale ?? 75);
          setImageRotation(nextActive.rotation ?? 0);
          setImgBrightness(nextActive.brightness ?? 100);
          setImgContrast(nextActive.contrast ?? 100);
          setImgSaturation(nextActive.saturation ?? 100);
          setImgHueRotate(nextActive.hueRotate ?? 0);
          setImgOpacity(nextActive.opacity ?? 100);
          setImgBlendMode(nextActive.blendMode || 'normal');
          setImgDropShadow(nextActive.dropShadow ?? 0);
        } else {
          setSelectedImageId(null);
          setUploadedImageUrl(null);
          setUploadedFile(null);
          if (!isBuiltInTemplate(uploadedFileName)) {
            setUploadedFileName(null);
            setUploadedFileSize(null);
          }
          setTextY(0);
        }
      }
      return remaining;
    });
    addToast('info', 'Image Removed', `"${removedName}" removed.`);
  }, [uploadedImages, selectedImageId, uploadedFileName, addToast]);

  const handleClearAllImages = useCallback(() => {
    setUploadedImages([]);
    setSelectedImageId(null);
    setUploadedImageUrl(null);
    setUploadedFile(null);
    if (!isBuiltInTemplate(uploadedFileName)) {
      setUploadedFileName(null);
      setUploadedFileSize(null);
    }
    setTextY(0);
    addToast('info', 'All Images Removed', 'All uploaded images removed from product.');
  }, [uploadedFileName, addToast]);

  // 
  // Template Management (Multiple templates support)
  // 
  const appliedTemplates = useMemo(() => {
    const list = [];
    if (!uploadedImageUrl && uploadedFileName && isBuiltInTemplate(uploadedFileName)) {
      list.push({ id: 'primary-template', name: uploadedFileName, isPrimary: true });
    }
    additionalGraphicLayers.forEach((layer) => {
      if (layer.isTemplate || isBuiltInTemplate(layer.name)) {
        list.push({ id: layer.id, name: layer.name, layer });
      }
    });
    return list;
  }, [uploadedImageUrl, uploadedFileName, additionalGraphicLayers]);

  const handleAddTemplate = useCallback((tpl) => {
    if (additionalTextLayers.length + additionalGraphicLayers.length >= LAYER_LIMIT) {
      addToast('error', 'Layer limit reached', 'Max 12 layers per design. Remove a layer to add more.');
      return;
    }
    const count = additionalGraphicLayers.length;
    const xOffsets = [0, -25, 25, 0, -30, 30, -15, 15];
    const yOffsets = [0, -15, -15, 28, 28, 28, -32, -32];
    const x = xOffsets[count % xOffsets.length];
    const y = yOffsets[count % yOffsets.length];
    const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setAdditionalGraphicLayers((ls) => [
      ...ls,
      {
        id,
        name: tpl.title,
        color: textColor,
        scale: 60,
        x,
        y,
        rotation: 0,
        visible: true,
        isTemplate: true,
      },
    ]);
    setSelectedTemplateId(id);

    // If text is empty or default, set to template text
    if (!customText || customText.trim() === '' || customText === 'YOUR TEXT HERE' || customText === 'GOOD VIBES') {
      setCustomText(tpl.text);
    }

    addToast('success', 'Template Added', `"${tpl.title}" added to product. You can add multiple templates!`);
  }, [additionalTextLayers.length, additionalGraphicLayers.length, textColor, customText, addToast]);

  const handleRemoveSelectedTemplate = useCallback(() => {
    const targetId = selectedTemplateId || (appliedTemplates.length > 0 ? appliedTemplates[appliedTemplates.length - 1].id : null);
    if (!targetId) {
      addToast('warning', 'No Template Selected', 'Select an applied template to remove.');
      return;
    }
    if (targetId === 'primary-template') {
      const removedName = uploadedFileName;
      setUploadedFileName(null);
      setUploadedFileSize(null);
      const remaining = appliedTemplates.filter((t) => t.id !== 'primary-template');
      setSelectedTemplateId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      addToast('info', 'Template Removed', `"${removedName}" removed from product.`);
      return;
    }
    const target = additionalGraphicLayers.find((l) => l.id === targetId);
    setAdditionalGraphicLayers((ls) => {
      const remaining = ls.filter((l) => l.id !== targetId);
      const remainingTemplates = remaining.filter((l) => l.isTemplate || isBuiltInTemplate(l.name));
      setSelectedTemplateId(remainingTemplates.length > 0 ? remainingTemplates[remainingTemplates.length - 1].id : null);
      return remaining;
    });
    addToast('info', 'Template Removed', `"${target?.name || 'Template'}" removed from product.`);
  }, [selectedTemplateId, appliedTemplates, uploadedFileName, additionalGraphicLayers, addToast]);

  const handleRemoveTemplateById = useCallback((id) => {
    if (id === 'primary-template') {
      const removedName = uploadedFileName;
      setUploadedFileName(null);
      setUploadedFileSize(null);
      setSelectedTemplateId((cur) => cur === 'primary-template' ? null : cur);
      addToast('info', 'Template Removed', `"${removedName}" removed from product.`);
      return;
    }
    const target = additionalGraphicLayers.find((l) => l.id === id);
    setAdditionalGraphicLayers((ls) => ls.filter((l) => l.id !== id));
    setSelectedTemplateId((cur) => {
      if (cur === id) {
        const remaining = appliedTemplates.filter((t) => t.id !== id);
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }
      return cur;
    });
    addToast('info', 'Template Removed', `"${target?.name || 'Template'}" removed from product.`);
  }, [uploadedFileName, appliedTemplates, additionalGraphicLayers, addToast]);

  const handleClearAllTemplates = useCallback(() => {
    if (uploadedFileName && isBuiltInTemplate(uploadedFileName)) {
      setUploadedFileName(null);
      setUploadedFileSize(null);
    }
    setAdditionalGraphicLayers((ls) => ls.filter((l) => !l.isTemplate && !isBuiltInTemplate(l.name)));
    setSelectedTemplateId(null);
    addToast('info', 'Templates Cleared', 'All templates removed from product.');
  }, [uploadedFileName, addToast]);

  // 
  // Layer management
  // 
  const LAYER_LIMIT = 12;

  const addTextLayer = useCallback(() => {
    if (additionalTextLayers.length + additionalGraphicLayers.length >= LAYER_LIMIT) {
      addToast('error', 'Layer limit', 'Max 12 layers per design.');
      return;
    }
    const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAdditionalTextLayers((ls) => [
      ...ls,
      { id, name: `Text ${ls.length + 1}`, text: 'Add text', font: selectedFont, color: textColor, scale: 100, x: 0, y: 0, rotation: 0, bold: true, visible: true },
    ]);
    setActiveTool(TOOL.LAYERS);
  }, [additionalTextLayers.length, additionalGraphicLayers.length, selectedFont, textColor, addToast]);

  const addGraphicLayer = useCallback((name = 'Good Vibes') => {
    if (additionalTextLayers.length + additionalGraphicLayers.length >= LAYER_LIMIT) {
      addToast('error', 'Layer limit', 'Max 12 layers per design.');
      return;
    }
    setAdditionalGraphicLayers((ls) => [
      ...ls,
      { id: `graphic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, color: textColor, scale: 55, x: 0, y: 0, rotation: 0, visible: true },
    ]);
    setActiveTool(TOOL.LAYERS);
  }, [additionalTextLayers.length, additionalGraphicLayers.length, textColor, addToast]);

  const updateTextLayer = useCallback((id, updates) => {
    setAdditionalTextLayers((ls) => ls.map((l) => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const updateGraphicLayer = useCallback((id, updates) => {
    setAdditionalGraphicLayers((ls) => ls.map((l) => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const moveLayer = useCallback((list, setList, id, dir) => {
    setList((ls) => {
      const idx = ls.findIndex((l) => l.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= ls.length) return ls;
      const next = [...ls];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  // 
  // Text change + undo/redo
  // 
  const handleTextChange = useCallback((val) => {
    setCustomText(val);
    const snap = { text: val, font: selectedFont, color: textColor, effect: selectedEffect };
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), snap]);
    setHistoryIndex((prev) => prev + 1);
  }, [selectedFont, textColor, selectedEffect, historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setCustomText(prev.text);
      setSelectedFont(prev.font);
      setTextColor(prev.color);
      setSelectedEffect(prev.effect);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setCustomText(next.text);
      setSelectedFont(next.font);
      setTextColor(next.color);
      setSelectedEffect(next.effect);
    }
  }, [history, historyIndex]);

  // Reset helpers
  const handleResetText = useCallback(() => { setTextScale(85); setTextX(0); setTextY(uploadedImageUrl ? 32 : 0); setTextRotation(0); }, [uploadedImageUrl]);
  const handleResetImage = useCallback(() => { setImageScale(90); setImageX(0); setImageY(customText ? -24 : 0); setImageRotation(0); }, [customText]);
  const handleResetFilters = useCallback(() => {
    setImgBrightness(100); setImgContrast(100); setImgSaturation(100);
    setImgHueRotate(0); setImgOpacity(100); setImgBlendMode('normal'); setImgDropShadow(0);
  }, []);
  const nudgeImage = (dx, dy) => {
    setImageX((x) => Math.max(-140, Math.min(140, x + dx)));
    setImageY((y) => Math.max(-140, Math.min(140, y + dy)));
  };
  const nudgeText = (dx, dy) => {
    setTextX((x) => Math.max(-140, Math.min(140, x + dx)));
    setTextY((y) => Math.max(-140, Math.min(140, y + dy)));
  };

  // 
  // Publish & Collections
  // 
  const loadShopifyCollections = useCallback(async () => {
    setCollectionsLoading(true);
    setCollectionsError('');
    try {
      const fn = api.shopify?.collections;
      if (typeof fn !== 'function') throw new Error('Shopify collection loading unavailable.');
      const result = await fn();
      const available = result?.data?.collections;
      if (!Array.isArray(available)) throw new Error('Collections response invalid.');
      setCollections(available);
    } catch (err) {
      setCollectionsError(err?.message || 'Unable to load Shopify collections.');
    } finally {
      setCollectionsLoading(false);
    }
  }, []);

  useEffect(() => { if (publishOpen) loadShopifyCollections(); }, [publishOpen, loadShopifyCollections]);

  const handleOpenPublish = useCallback(() => {
    if (!variantSelectionValid) {
      addToast('error', 'Unavailable combination', 'Select a valid option combination before publishing.');
      return;
    }
    setCollectionChoice({ type: 'none' });
    setNewCollectionName('');
    setCollectionNameError('');
    setPublishOpen(true);
  }, [variantSelectionValid, addToast]);

  const handleCollectionChoiceChange = useCallback((value) => {
    if (value === 'none' || value === 'new') setCollectionChoice({ type: value });
    else setCollectionChoice({ type: 'existing', id: value });
    setCollectionNameError('');
  }, []);

  const handlePublishToStorefront = useCallback(async () => {
    if (!variantSelectionValid) {
      setCollectionNameError('Select a valid product option combination first.');
      return;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(customProductPrice))) {
      setCollectionNameError('Enter a valid custom price with up to 2 decimal places.');
      return;
    }
    if (collectionChoice.type === 'new' && (newCollectionName.trim().length < 2 || newCollectionName.trim().length > 100)) {
      setCollectionNameError('Collection name must be 2-100 characters.');
      return;
    }
    setIsPublishing(true);
    setCollectionNameError('');
    try {
      const title = `${activeProduct.name}${customText.trim() ? ` - ${customText.trim()}` : ''}`.slice(0, 255);
      const fn = api.shopify?.publish;
      if (typeof fn !== 'function') throw new Error('Shopify publishing unavailable.');
      const artwork = await createProductArtwork({
        mockupUrl: publishMockupUrl,
        previewCanvasSize: 420,
        productId: selectedProductId,
        productColor: activeProduct.colors[selectedColorIndex],
        printArea: activePrintArea,
        uploadedImageUrl,
        uploadedFileName,
        customText: customText.trim(),
        selectedFont, textColor, isBold, isItalic, isUnderline,
        alignment, selectedEffect, textScale, textX, textY, textRotation,
        imageScale, imageX, imageY, imageRotation,
        additionalTextLayers, additionalGraphicLayers,
        additionalImageLayers: getSyncedUploadedImages(),
      });
      const result = await fn({
        title,
        sourceProductId: activeProduct.storeProductId || '',
        productType: activeProduct.productType || activeProduct.category || activeProduct.name,
        price: customProductPrice,
        color: selectedColorName,
        size: selectedSize,
        options: activeProductOptions.map((o) => ({
          name: o.name, value: selectedOptionValues[o.name] || o.values[0],
        })),
        technique: activeProduct.compatibleTechniques?.[0] || 'dtg',
        customText: customText.trim(),
        artwork,
        collection: collectionChoice.type === 'existing'
          ? collectionChoice
          : collectionChoice.type === 'new'
            ? { type: 'new', title: newCollectionName.trim() }
            : { type: 'none' },
      });
      if (result?.success === false) throw new Error(result.message || 'Unable to publish.');
      setPublishOpen(false);
      addToast('success', 'Published!', result?.message || 'Product is live on your Online Store.');
    } catch (err) {
      const partial = err?.data?.data?.product ?? null;
      if (partial?.id) setPublishOpen(false);
      addToast('error', partial ? 'Partially Published' : 'Publish Failed',
        partial
          ? `${partial.title || 'Product'} created but publishing didn't finish. Check Shopify.`
          : err?.message || 'Unable to publish this product.');
    } finally {
      setIsPublishing(false);
    }
  }, [
    variantSelectionValid, collectionChoice, newCollectionName, customProductPrice, activeProduct, 
    activeVariant, activeProductImage, publishMockupUrl, activePrintArea, activeProductOptions,
    alignment, customText, imageRotation, imageScale, imageX, imageY,
    isBold, isItalic, isUnderline, selectedEffect, selectedFont,
    selectedColorIndex, selectedProductId, textColor, textRotation, textScale,
    textX, textY, selectedSize, selectedColorName, selectedOptionValues,
    uploadedFileName, uploadedImageUrl, additionalTextLayers, additionalGraphicLayers, addToast,
  ]);

  // 
  // Version History (unchanged API calls)
  // 
  const getProductDesign = useCallback(async (productId, productVariantId = null, force = false) => {
    const key = `${productId}:${productVariantId || ''}`;
    const cached = designRecordsRef.current.get(key);
    if (cached && !force) return cached;
    const result = await api.designs.list({ productId, productVariantId: productVariantId || '', limit: 100, page: 1 });
    const designs = result.data?.designs;
    if (!Array.isArray(designs)) throw new Error('Design history response invalid.');
    const design = designs.find((d) => String(d.productVariantId || '') === String(productVariantId || '')) || null;
    if (design) designRecordsRef.current.set(key, design);
    else designRecordsRef.current.delete(key);
    return design;
  }, []);

  const refreshVersionHistory = useCallback(async (productId, productVariantId = null, designRecord = null) => {
    const reqId = ++historyRequestIdRef.current;
    setVersionHistoryLoading(true);
    setVersionHistoryError('');
    try {
      const design = designRecord || await getProductDesign(productId, productVariantId, true);
      if (!design) {
        if (historyModalProductIdRef.current === productId && reqId === historyRequestIdRef.current) setVersionHistory([]);
        return [];
      }
      const result = await api.designs.revisions(design.id || design._id, { productId, productVariantId: productVariantId || '' });
      const revisions = result.data?.revisions;
      if (!Array.isArray(revisions)) throw new Error('Version history response invalid.');
      const hist = revisions
        .filter((r) => r.productId === productId && String(r.productVariantId || '') === String(productVariantId || ''))
        .sort((a, b) => a.version - b.version)
        .map(mapRevisionToVersion);
      if (historyModalProductIdRef.current === productId && reqId === historyRequestIdRef.current) setVersionHistory(hist);
      return hist;
    } catch (err) {
      if (historyModalProductIdRef.current === productId && reqId === historyRequestIdRef.current) {
        setVersionHistory([]);
        setVersionHistoryError(err.message || 'Unable to load version history.');
      }
      throw err;
    } finally {
      if (historyModalProductIdRef.current === productId && reqId === historyRequestIdRef.current) setVersionHistoryLoading(false);
    }
  }, [getProductDesign]);

  const loadVersionDetail = useCallback(async (version) => {
    const productId = version.productId;
    const design = await getProductDesign(productId, null, true);
    if (!design) throw new Error('Design no longer available.');
    const result = await api.designs.revision(design.id || design._id, version.version, { productId, productVariantId: '' });
    const revision = result.data?.revision;
    if (!revision || revision.productId !== productId) throw new Error('Version belongs to a different product.');
    return mapRevisionToVersion(revision);
  }, [getProductDesign]);

  useEffect(() => {
    if (!versionCompareOpen) return;
    setHistoryModalProductId(selectedProductId);
    historyModalProductIdRef.current = selectedProductId;
    refreshVersionHistory(selectedProductId).catch((e) => console.error('[Studio] version history:', e));
  }, [versionCompareOpen, selectedProductId, refreshVersionHistory]);

  const handleModalProductChange = useCallback((productId) => {
    setHistoryModalProductId(productId);
    historyModalProductIdRef.current = productId;
    setVersionHistory([]);
    setVersionHistoryError('');
    refreshVersionHistory(productId).catch((e) => console.error('[Studio] modal product change:', e));
  }, [refreshVersionHistory]);

  const persistVersionSnapshot = useCallback(async (note) => {
    const productId = activeProduct.id;
    const productVariantId = activeVariant?.id || null;
    const canvasState = {
      customText, selectedFont, textColor, selectedEffect,
      textScale, textX, textY, textRotation,
      additionalTextLayers, additionalGraphicLayers,
      imageScale, imageX, imageY, imageRotation,
      uploadedFileName, productId, productName: activeProduct.name,
      productColor: activeProduct.colors[selectedColorIndex],
      productColorName: activeProduct.colorNames[selectedColorIndex],
      colorIndex: selectedColorIndex, size: selectedSize,
      selectedOptions: selectedOptionValues,
    };
    const design = await getProductDesign(productId, productVariantId);
    const payload = { productId, productVariantId, canvasState, changeNote: note };
    const result = design
      ? await api.designs.update(design.id || design._id, { ...payload, expectedVersion: design.version })
      : await api.designs.create(payload);
    const saved = result.data?.design;
    if (!saved?.id && !saved?._id) throw new Error('Server did not return the saved design.');
    const persisted = { ...saved, id: saved.id || saved._id, productId, productVariantId };
    designRecordsRef.current.set(`${productId}:${productVariantId || ''}`, persisted);
    return { canvasState, persistedDesign: persisted };
  }, [
    activeProduct, activeVariant, customText, selectedFont, textColor, selectedEffect,
    textScale, textX, textY, textRotation, additionalTextLayers, additionalGraphicLayers,
    imageScale, imageX, imageY, imageRotation, uploadedFileName, selectedColorIndex,
    selectedSize, selectedOptionValues, getProductDesign,
  ]);

  const handleCreateSnapshot = useCallback(async (note) => {
    const trimmed = (note || '').trim();
    if (!trimmed || trimmed.length < 2) { addToast('error', 'Validation', 'Version note needs at least 2 characters.'); return false; }
    if (trimmed.length > 120) { addToast('error', 'Validation', 'Version note max 120 characters.'); return false; }
    setIsSaving(true);
    try {
      await persistVersionSnapshot(trimmed);
      setHistoryModalProductId(activeProduct.id);
      historyModalProductIdRef.current = activeProduct.id;
      await refreshVersionHistory(activeProduct.id, null).catch(() => {});
      addToast('success', 'Snapshot Saved', `Version "${trimmed}" saved.`);
      return true;
    } catch (err) {
      setVersionHistoryError(err.message || 'Unable to save version.');
      addToast('error', 'Snapshot Failed', err.message || 'Unable to save.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [persistVersionSnapshot, refreshVersionHistory, activeProduct, addToast]);

  const handleRestoreVersion = useCallback((version) => {
    const s = version.state;
    if (!s) return;
    if (s.customText !== undefined) setCustomText(s.customText);
    if (s.selectedFont) setSelectedFont(s.selectedFont);
    if (s.textColor) setTextColor(s.textColor);
    if (s.selectedEffect) setSelectedEffect(s.selectedEffect);
    if (s.textScale !== undefined) setTextScale(s.textScale);
    if (s.textX !== undefined) setTextX(s.textX);
    if (s.textY !== undefined) setTextY(s.textY);
    if (s.textRotation !== undefined) setTextRotation(s.textRotation);
    if (Array.isArray(s.additionalTextLayers)) setAdditionalTextLayers(s.additionalTextLayers);
    if (Array.isArray(s.additionalGraphicLayers)) setAdditionalGraphicLayers(s.additionalGraphicLayers);
    if (s.imageScale !== undefined) setImageScale(s.imageScale);
    if (s.imageX !== undefined) setImageX(s.imageX);
    if (s.imageY !== undefined) setImageY(s.imageY);
    if (s.imageRotation !== undefined) setImageRotation(s.imageRotation);
    if (s.productId) handleProductSelect(s.productId);
    if (s.selectedOptions) setSelectedOptionValues((cur) => ({ ...cur, ...s.selectedOptions }));
    setVersionCompareOpen(false);
    addToast('success', 'Version Restored', `Restored to "${version.versionName}".`);
  }, [handleProductSelect, addToast]);

  // 
  // Save Design
  // 
  const handleSaveDesign = useCallback(async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const dateStr = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const note = `Saved - "${customText || activeProduct.name}" on ${dateStr}`;
      const canvasStateForLibrary = {
        text: customText, customText, font: selectedFont, color: textColor, effect: selectedEffect,
        textScale, textX, textY, textRotation, additionalTextLayers, additionalGraphicLayers,
        imageScale, imageX, imageY, imageRotation, uploadedFileName, uploadedImageUrl,
        uploadedImages: getSyncedUploadedImages(), selectedImageId,
        size: selectedSize, selectedOptions: selectedOptionValues,
        productType: activeProduct.name, productColor: activeProduct.colors[selectedColorIndex],
        productColorName: activeProduct.colorNames[selectedColorIndex],
        customPrice: customProductPrice,
        productId: activeProduct.id, colorIndex: selectedColorIndex,
        productImage: activeProduct.image || null,
        storeProductId: activeProduct.storeProductId || null,
      };
      const designName = (customText || activeProduct.name).trim();
      const localId = 'design_' + Date.now();
      const localRecord = {
        id: localId, _id: localId, studioKey: localId, syncStatus: 'pending', name: designName,
        shopifyProductId: activeProduct.id, canvasState: canvasStateForLibrary,
        tags: [activeProduct.name, selectedFont],
        thumbnailUrl: uploadedImageUrl || activeProduct.image,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      try {
        const stored = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
        const updated = [localRecord, ...stored.filter((d) => !(d.name === designName && d.shopifyProductId === activeProduct.id))];
        localStorage.setItem('customforge_saved_designs', JSON.stringify(updated));
      } catch (e) { console.warn('localStorage write failed:', e); }

      await persistVersionSnapshot(note);
      let libErr = null;
      try {
        const saved = await api.library.save({
          id: localId, studioKey: localId, name: designName, shopifyProductId: activeProduct.id,
          canvasState: canvasStateForLibrary, tags: [activeProduct.name, selectedFont],
          thumbnailUrl: uploadedImageUrl || activeProduct.image,
        });
        const backendItem = saved?.data?.item;
        if (backendItem?.id) {
          const syncedRecord = {
            ...localRecord,
            id: String(backendItem.id),
            _id: String(backendItem.id),
            studioKey: localId,
            syncStatus: 'synced',
          };
          try {
            const stored = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
            localStorage.setItem('customforge_saved_designs', JSON.stringify([
              syncedRecord,
              ...stored.filter((item) => String(item.id || item._id) !== localId && !(item.name === designName && item.shopifyProductId === activeProduct.id)),
            ]));
          } catch (e) { console.warn('Synced design local write failed:', e); }
        }
      } catch (e) { libErr = e; }

      setSavedSuccess(true);
      addToast(
        libErr ? 'info' : 'success',
        libErr ? 'Version Saved (library sync failed)' : 'Design Saved',
        libErr
          ? `Version saved but library update failed: ${libErr.message}`
          : `"${designName}" saved. Access it from My Saved Designs.`,
      );
    } catch (err) {
      addToast('error', 'Save Failed', err.message || 'Unable to persist this design.');
    } finally {
      setIsSaving(false);
    }
  }, [
    customText, activeProduct, selectedFont, textColor, selectedEffect, selectedSize, customProductPrice,
    textScale, textX, textY, textRotation, additionalTextLayers, additionalGraphicLayers,
    imageScale, imageX, imageY, imageRotation, uploadedFileName, uploadedImageUrl,
    selectedColorIndex, selectedOptionValues, persistVersionSnapshot, addToast,
  ]);

  // 
  // URL param loading (template / product / libraryItem) - unchanged logic
  // 
  useEffect(() => {
    const tpl = searchParams.get('template');
    if (tpl) setCustomText(decodeURIComponent(tpl));
    const prod = searchParams.get('product') || searchParams.get('category');
    if (prod) {
      const q = decodeURIComponent(prod).toLowerCase();
      const match = products.find((p) => p.id === q || `${p.name} ${p.category} ${p.productType}`.toLowerCase().includes(q));
      if (match) handleProductSelect(match.id);
      else if (q.includes('hoodie')) handleProductSelect('hoodie');
      else if (q.includes('mug')) handleProductSelect('mug');
      else if (q.includes('phone')) handleProductSelect('phone_case');
      else if (q.includes('tshirt') || q.includes('shirt')) handleProductSelect('tshirt');
    }
    const libId = searchParams.get('libraryItem') || searchParams.get('designId');
    if (libId) {
      const applyState = (state, dName) => {
        if (!state) return;
        if (state.productId) handleProductSelect(state.productId);
        if (state.text !== undefined) setCustomText(state.text);
        else if (state.customText !== undefined) setCustomText(state.customText);
        else if (dName) setCustomText(dName);
        if (state.font || state.selectedFont) setSelectedFont(state.font || state.selectedFont);
        if (state.color || state.textColor) setTextColor(state.color || state.textColor);
        if (state.effect || state.selectedEffect) setSelectedEffect(state.effect || state.selectedEffect);
        if (state.textScale !== undefined) setTextScale(state.textScale);
        if (state.textX !== undefined) setTextX(state.textX);
        if (state.textY !== undefined) setTextY(state.textY);
        if (state.textRotation !== undefined) setTextRotation(state.textRotation);
        if (state.imageScale !== undefined) setImageScale(state.imageScale);
        if (state.imageX !== undefined) setImageX(state.imageX);
        if (state.imageY !== undefined) setImageY(state.imageY);
        if (state.imageRotation !== undefined) setImageRotation(state.imageRotation);
        if (state.customPrice !== undefined || state.customProductPrice !== undefined) setCustomProductPrice(state.customPrice ?? state.customProductPrice);
        if (state.selectedOptions) setSelectedOptionValues((current) => ({ ...current, ...state.selectedOptions }));
        if (state.size) setSelectedSize(state.size);
        if (Array.isArray(state.additionalTextLayers)) setAdditionalTextLayers(state.additionalTextLayers);
        if (Array.isArray(state.additionalGraphicLayers)) setAdditionalGraphicLayers(state.additionalGraphicLayers);
        if (state.uploadedFileName !== undefined) setUploadedFileName(state.uploadedFileName);
        if (state.uploadedImageUrl) setUploadedImageUrl(state.uploadedImageUrl);
        if (Array.isArray(state.uploadedImages) && state.uploadedImages.length > 0) {
          setUploadedImages(state.uploadedImages);
          setSelectedImageId(state.selectedImageId || state.uploadedImages[0].id);
        }
        addToast('info', 'Design Loaded', `"${dName || 'Saved Design'}" loaded.`);
      };
      let found = false;
      try {
        const stored = JSON.parse(localStorage.getItem('customforge_saved_designs') || '[]');
        const match = stored.find((d) => String(d.id || d._id) === String(libId));
        if (match?.canvasState) { applyState(match.canvasState, match.name); found = true; }
      } catch (e) { console.warn('[Studio] localStorage read failed:', e); }
      if (!found && api.library.getById) {
        api.library.getById(libId).then((res) => {
          const item = res?.data?.item || res?.data;
          if (item?.canvasState) applyState(item.canvasState, item.name);
        }).catch(() => {});
      }
    }
  }, [searchParams, handleProductSelect, products, addToast]);

  // 
  // Render
  // 
  const canvasW = 420;
  const canvasH = 480;

  return (
    <div className="cfs-root">
      {/* ---------------- TOP BAR ---------------- */}
      <div className="cfs-topbar">
        <button className="cfs-topbar-brand" onClick={() => navigate(`${basePath}/`)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <div className="cfs-topbar-brand-dot" />
          CustomForge Studio
        </button>
        <div className="cfs-topbar-divider" />
        <div className="cfs-topbar-title">
          {activeProduct.name} {selectedColorName ? `- ${selectedColorName}` : ''} {selectedSize && selectedSize !== 'Default' ? `- ${selectedSize}` : ''}
        </div>

        {/* Action toolbar */}
        <div className="cfs-topbar-actions">
          <button
            className="cfs-btn cfs-btn-ghost cfs-btn-sm"
            disabled={historyIndex <= 0}
            onClick={handleUndo}
            title="Undo"
          >Undo</button>
          <button
            className="cfs-btn cfs-btn-ghost cfs-btn-sm"
            disabled={historyIndex >= history.length - 1}
            onClick={handleRedo}
            title="Redo"
          >Redo</button>

          <div className="cfs-topbar-divider" />

          <button
            className="cfs-btn cfs-btn-ghost cfs-btn-sm"
            onClick={() => setShowGuides((g) => !g)}
          >
            {showGuides ? 'Hide Guides' : 'Show Guides'}
          </button>

          <button
            className="cfs-btn cfs-btn-ghost cfs-btn-sm"
            onClick={() => setVersionCompareOpen(true)}
          >
            History
          </button>

          {savedSuccess && (
            <span className="cfs-badge cfs-badge-success">Saved</span>
          )}

          <button
            className="cfs-btn cfs-btn-secondary cfs-btn-sm"
            onClick={handleSaveDesign}
            disabled={isSaving}
          >
            {isSaving ? <><span className="cfs-spinner" /> Saving...</> : <><IconSave /> Save Design</>}
          </button>

          <button
            className="cfs-btn cfs-btn-primary cfs-btn-sm"
            onClick={handleOpenPublish}
          ><IconPublish /> Publish to Storefront</button>
        </div>
      </div>

      {/* ---------------- BODY ---------------- */}
      <div className="cfs-body">

        {/*  Left sidebar icon rail  */}
        <div className="cfs-sidebar">
          {TOOL_BUTTONS.map((t) => (
            <button
              key={t.id}
              className={`cfs-tool-btn ${activeTool === t.id ? 'active' : ''}`}
              onClick={() => setActiveTool(activeTool === t.id ? null : t.id)}
              title={t.label}
            >
              <span className="cfs-tool-icon">{getToolIcon(t.id)}</span>
              <span className="cfs-tool-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/*  Inspector Panel (slides open alongside sidebar)  */}
        {activeTool && (
          <div className="cfs-inspector">
            <div className="cfs-inspector-header">
              <span className="cfs-inspector-title">
                {TOOL_BUTTONS.find((t) => t.id === activeTool)?.label || 'Tools'}
              </span>
              <button className="cfs-btn-icon" onClick={() => setActiveTool(null)} title="Close">&times;</button>
            </div>
            <div className="cfs-inspector-body">

              {/*  TEMPLATES  */}
              {activeTool === TOOL.TEMPLATES && (
                <div className="cfs-section">
                  <div className="cfs-section-heading">Design Templates</div>
                  <p className="cfs-text-sm" style={{ marginBottom: 12 }}>
                    Add multiple templates to your product. You can mix, match, and remove selected templates at any time.
                  </p>

                  {/* Applied Templates / Remove Selected Template */}
                  {appliedTemplates.length > 0 && (
                    <div style={{
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: 16
                    }}>
                      <div className="cfs-row-between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <span className="cfs-text-sm" style={{ fontWeight: 600, color: 'var(--cfs-text)' }}>
                          Applied Templates ({appliedTemplates.length})
                        </span>
                        <div className="cfs-row" style={{ gap: 4 }}>
                          <button
                            type="button"
                            className="cfs-btn cfs-btn-danger cfs-btn-xs"
                            onClick={handleRemoveSelectedTemplate}
                            title="Remove the currently selected template"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <IconTrash size={12} /> Remove Selected Template
                          </button>
                          {appliedTemplates.length > 1 && (
                            <button
                              type="button"
                              className="cfs-btn cfs-btn-ghost cfs-btn-xs"
                              style={{ color: '#ef4444' }}
                              onClick={handleClearAllTemplates}
                              title="Remove all templates"
                            >
                              Clear All
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {appliedTemplates.map((tpl) => {
                          const isSelected = selectedTemplateId === tpl.id || (appliedTemplates.length === 1 && !selectedTemplateId);
                          return (
                            <div
                              key={tpl.id}
                              onClick={() => setSelectedTemplateId(tpl.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 10px',
                                borderRadius: 6,
                                background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                                border: isSelected ? '1px solid rgba(99, 102, 241, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <IconTemplates size={16} />
                                <span style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, color: '#14142b' }}>
                                  {tpl.name}
                                </span>
                                {isSelected && (
                                  <span className="cfs-badge cfs-badge-primary" style={{ fontSize: 9, padding: '1px 5px' }}>
                                    Selected
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="cfs-btn-icon cfs-btn-xs"
                                style={{ color: '#ef4444', width: 22, height: 22 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveTemplateById(tpl.id);
                                }}
                                title="Remove template"
                              >
                                &times;
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Template Presets Grid */}
                  <div className="cfs-section-heading" style={{ marginTop: 4, marginBottom: 8 }}>
                    Add Templates (Multiple Allowed)
                  </div>
                  <div className="cfs-template-grid">
                    {TEMPLATE_PRESETS.map((tpl) => {
                      const countApplied = appliedTemplates.filter((a) => a.name.toLowerCase() === tpl.title.toLowerCase()).length;
                      return (
                        <div
                          key={tpl.title}
                          className={`cfs-template-card ${countApplied > 0 ? 'active' : ''}`}
                          onClick={() => handleAddTemplate(tpl)}
                          title={`Click to add "${tpl.title}" template to product`}
                          style={{
                            position: 'relative',
                            borderColor: countApplied > 0 ? 'rgba(99, 102, 241, 0.5)' : undefined
                          }}
                        >
                          {countApplied > 0 && (
                            <span
                              className="cfs-badge cfs-badge-success"
                              style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                fontSize: 9,
                                padding: '1px 4px'
                              }}
                            >
                              {countApplied > 1 ? `Added ×${countApplied}` : 'Added'}
                            </span>
                          )}
                          <div className="cfs-template-card-icon"><IconTemplates size={24} /></div>
                          <div className="cfs-template-card-title">{tpl.title}</div>
                          <div className="cfs-template-card-sub">{tpl.category}</div>
                          <button
                            type="button"
                            className="cfs-btn cfs-btn-secondary cfs-btn-xs"
                            style={{
                              marginTop: 6,
                              width: '100%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddTemplate(tpl);
                            }}
                          >
                            <IconPlus size={11} /> {countApplied > 0 ? 'Add Another' : 'Add to Product'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/*  TEXT TOOL  */}
              {activeTool === TOOL.TEXT && (
                <div className="cfs-section">
                  <div className="cfs-section-heading">Text Content</div>
                  <div>
                    <label className="cfs-label">Your Text</label>
                    <textarea
                      className="cfs-textarea"
                      rows={2}
                      value={customText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      placeholder="Type your design text..."
                    />
                  </div>

                  <div>
                    <label className="cfs-label">Font Family</label>
                    <select className="cfs-select" value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)}>
                      {FONT_CATEGORIES.map((cat) => (
                        <optgroup key={cat.category} label={cat.category}>
                          {cat.fonts.map((f) => (
                            <option
                              key={f.value}
                              value={f.value}
                              style={{ fontFamily: `'${f.value}', ${f.fallback}` }}
                            >
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="cfs-section-heading" style={{ marginTop: 4 }}>Style</div>
                  <div className="cfs-row cfs-flex-wrap" style={{ gap: 5 }}>
                    {[
                      { label: 'B', active: isBold, action: () => setIsBold((b) => !b), title: 'Bold', style: { fontWeight: 800 } },
                      { label: 'I', active: isItalic, action: () => setIsItalic((i) => !i), title: 'Italic', style: { fontStyle: 'italic' } },
                      { label: 'U', active: isUnderline, action: () => setIsUnderline((u) => !u), title: 'Underline', style: { textDecoration: 'underline' } },
                      { label: <IconAlignLeft />, active: alignment === 'left', action: () => setAlignment('left'), title: 'Align Left' },
                      { label: <IconAlignCenter />, active: alignment === 'center', action: () => setAlignment('center'), title: 'Align Center' },
                      { label: <IconAlignRight />, active: alignment === 'right', action: () => setAlignment('right'), title: 'Align Right' },
                    ].map((btn) => (
                      <button
                        key={btn.title}
                        title={btn.title}
                        className={`cfs-btn cfs-btn-toggle cfs-btn-sm ${btn.active ? 'active' : ''}`}
                        onClick={btn.action}
                        style={btn.style}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  <div className="cfs-section-heading" style={{ marginTop: 4 }}>Text Color</div>
                  <div className="cfs-color-input-wrap">
                    <input type="color" className="cfs-color-picker" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                    <span className="cfs-color-hex">{textColor}</span>
                  </div>
                  <div className="cfs-swatch-row">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c.hex}
                        className={`cfs-swatch ${textColor === c.hex ? 'active' : ''}`}
                        title={c.label}
                        style={{ backgroundColor: c.hex, border: c.hex === '#ffffff' ? '1px solid rgba(255,255,255,0.15)' : undefined }}
                        onClick={() => setTextColor(c.hex)}
                      />
                    ))}
                  </div>

                  <div className="cfs-section-heading" style={{ marginTop: 4 }}>Effect</div>
                  <div className="cfs-effect-row">
                    {EFFECTS.map((eff) => (
                      <button
                        key={eff.id}
                        className={`cfs-effect-pill ${selectedEffect === eff.id ? 'active' : ''}`}
                        onClick={() => setSelectedEffect(eff.id)}
                      >
                        {eff.label}
                      </button>
                    ))}
                  </div>

                  <div className="cfs-divider" />
                  <div className="cfs-row-between">
                    <span className="cfs-section-heading" style={{ marginBottom: 0 }}>Position & Scale</span>
                    <button className="cfs-btn cfs-btn-ghost cfs-btn-xs" onClick={handleResetText}>Reset</button>
                  </div>
                  <CfsSlider label="Size" value={textScale} onChange={setTextScale} min={20} max={200} unit="%" />
                  <CfsSlider label="X Position" value={textX} onChange={setTextX} min={-140} max={140} unit="px" />
                  <CfsSlider label="Y Position" value={textY} onChange={setTextY} min={-140} max={140} unit="px" />
                  <CfsSlider label="Rotation" value={textRotation} onChange={setTextRotation} min={-180} max={180} unit="deg" />

                  <div className="cfs-section-heading" style={{ marginTop: 4 }}>Nudge</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 100, margin: '0 auto' }}>
                    <span />
                    <button className="cfs-nudge-btn" onClick={() => nudgeText(0, -10)} title="Up"><IconArrowUp /></button>
                    <span />
                    <button className="cfs-nudge-btn" onClick={() => nudgeText(-10, 0)} title="Left"><IconArrowLeft /></button>
                    <button className="cfs-nudge-btn" onClick={() => { setTextX(0); setTextY(0); }} title="Center"><IconCenterTarget /></button>
                    <button className="cfs-nudge-btn" onClick={() => nudgeText(10, 0)} title="Right"><IconArrowRight /></button>
                    <span />
                    <button className="cfs-nudge-btn" onClick={() => nudgeText(0, 10)} title="Down"><IconArrowDown /></button>
                    <span />
                  </div>

                  <button className="cfs-btn cfs-btn-secondary cfs-btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={addTextLayer}>
                    + Add Another Text Layer
                  </button>
                </div>
              )}

              {/*  UPLOAD  */}
              {activeTool === TOOL.UPLOAD && (
                <div className="cfs-section">
                  <div className="cfs-section-heading">Upload Artwork</div>
                  <div
                    ref={dropzoneRef}
                    className={`cfs-dropzone ${isDragActive ? 'drag-active' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/postscript,application/pdf"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleFileInput}
                    />
                    <div className="cfs-dropzone-icon"><IconUpload size={32} /></div>
                    <div className="cfs-dropzone-title">
                      {uploadedImages.length > 0 ? 'Add another image' : 'Drop artwork here'}
                    </div>
                    <div className="cfs-dropzone-sub">SVG, PNG, JPG, AI, EPS, PDF</div>
                  </div>

                  {/* Uploaded images on the product */}
                  {uploadedImages.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="cfs-row-between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <span className="cfs-text-sm" style={{ fontWeight: 600, color: 'var(--cfs-text)' }}>
                          Images on Product ({uploadedImages.length})
                        </span>
                        <div className="cfs-row" style={{ gap: 4 }}>
                          <button
                            type="button"
                            className="cfs-btn cfs-btn-danger cfs-btn-xs"
                            onClick={handleRemoveImage}
                            title="Remove the currently selected image"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <IconTrash size={12} /> Remove Selected Image
                          </button>
                          {uploadedImages.length > 1 && (
                            <button
                              type="button"
                              className="cfs-btn cfs-btn-ghost cfs-btn-xs"
                              style={{ color: '#ef4444' }}
                              onClick={handleClearAllImages}
                              title="Remove all uploaded images"
                            >
                              Clear All
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Thumbnails of all uploaded images */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                        {uploadedImages.map((img) => {
                          const isSelected = img.id === selectedImageId || (uploadedImages.length === 1 && !selectedImageId);
                          return (
                            <div
                              key={img.id}
                              onClick={() => handleSelectUploadedImage(img)}
                              style={{
                                border: isSelected ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 6,
                                padding: 4,
                                background: isSelected ? 'rgba(99,102,241,0.2)' : 'rgba(0,0,0,0.25)',
                                cursor: 'pointer',
                                position: 'relative'
                              }}
                              title={`Click to select "${img.name}" for adjustments`}
                            >
                              <div className="cfs-transparency-bg" style={{ height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, overflow: 'hidden' }}>
                                <img src={img.url} alt={img.name} style={{ maxHeight: 50, maxWidth: '100%', objectFit: 'contain' }} />
                              </div>
                              {isSelected && (
                                <span
                                  className="cfs-badge cfs-badge-primary"
                                  style={{
                                    position: 'absolute',
                                    bottom: 2,
                                    left: 2,
                                    fontSize: 8,
                                    padding: '0 4px',
                                    lineHeight: '14px'
                                  }}
                                >
                                  Selected
                                </span>
                              )}
                              <button
                                type="button"
                                className="cfs-btn-icon cfs-btn-xs"
                                style={{
                                  position: 'absolute',
                                  top: 2,
                                  right: 2,
                                  width: 18,
                                  height: 18,
                                  color: '#ef4444',
                                  background: 'rgba(0,0,0,0.7)',
                                  borderRadius: 4
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteUploadedImage(img.id);
                                }}
                                title="Remove image from product"
                              >
                                &times;
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Selected image detail card — derive from selectedImageId in array for accuracy */}
                      {(() => {
                        const activeImg = uploadedImages.find((img) => img.id === selectedImageId) || uploadedImages[uploadedImages.length - 1];
                        if (!activeImg) return null;
                        return (
                          <>
                            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                              <div className="cfs-row-between">
                                <span className="cfs-text-md" style={{ fontWeight: 600 }}>
                                  {activeImg.name || 'Custom Artwork'}
                                </span>
                                <span className="cfs-badge cfs-badge-success">Loaded</span>
                              </div>
                              <div className="cfs-text-xs" style={{ marginTop: 3 }}>{activeImg.size}</div>
                            </div>

                            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', marginTop: 8 }}>
                              <div className="cfs-transparency-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
                                <img src={activeImg.url} alt={activeImg.name || 'Preview'} style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {uploadedImages.length === 0 && uploadedImageUrl && (
                    <>
                      <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '10px 12px', marginTop: 12 }}>
                        <div className="cfs-row-between">
                          <span className="cfs-text-md" style={{ fontWeight: 600 }}>
                            {uploadedFileName || 'Custom Artwork'}
                          </span>
                          <span className="cfs-badge cfs-badge-success">Loaded</span>
                        </div>
                        <div className="cfs-text-xs" style={{ marginTop: 3 }}>{uploadedFileSize}</div>
                      </div>

                      <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', marginTop: 8 }}>
                        <div className="cfs-transparency-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
                          <img src={uploadedImageUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                        </div>
                      </div>

                      <div className="cfs-row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        <button
                          type="button"
                          className="cfs-btn cfs-btn-danger cfs-btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          onClick={handleRemoveImage}
                        >
                          <IconTrash size={14} /> Remove Selected Image
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/*  IMAGE ADJUSTMENTS (CSS Filters)  */}
              {activeTool === TOOL.IMAGE_ADJUST && (
                <div className="cfs-section">
                  <div className="cfs-row-between">
                    <span className="cfs-section-heading" style={{ marginBottom: 0 }}>Image Adjustments</span>
                    <button className="cfs-btn cfs-btn-ghost cfs-btn-xs" onClick={handleResetFilters}>Reset All</button>
                  </div>

                  {!uploadedImageUrl && (
                    <div className="cfs-text-sm" style={{ padding: '8px 0', textAlign: 'center', opacity: 0.6 }}>
                      Upload an image first to use filters.
                    </div>
                  )}

                  <div className="cfs-section-heading" style={{ marginTop: 4 }}>CSS Filters</div>
                  <CfsSlider label="Brightness" value={imgBrightness} onChange={setImgBrightness} min={0} max={200} unit="%" />
                  <CfsSlider label="Contrast" value={imgContrast} onChange={setImgContrast} min={0} max={300} unit="%" />
                  <CfsSlider label="Saturation" value={imgSaturation} onChange={setImgSaturation} min={0} max={300} unit="%" />
                  <CfsSlider label="Hue Rotate" value={imgHueRotate} onChange={setImgHueRotate} min={0} max={360} unit="deg" />
                  <CfsSlider label="Opacity" value={imgOpacity} onChange={setImgOpacity} min={0} max={100} unit="%" />
                  <CfsSlider label="Drop Shadow" value={imgDropShadow} onChange={setImgDropShadow} min={0} max={30} unit="px" />

                  <div className="cfs-section-heading" style={{ marginTop: 8 }}>Blend Mode</div>
                  <div className="cfs-blend-pills">
                    {BLEND_MODES.map((m) => (
                      <button
                        key={m}
                        className={`cfs-blend-pill ${imgBlendMode === m ? 'active' : ''}`}
                        onClick={() => setImgBlendMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <div className="cfs-divider" />
                  <div className="cfs-section-heading">Transform</div>
                  <div className="cfs-row-between">
                    <span className="cfs-text-sm">Position &amp; Scale</span>
                    <button className="cfs-btn cfs-btn-ghost cfs-btn-xs" onClick={handleResetImage}>Reset</button>
                  </div>
                  <CfsSlider label="Scale" value={imageScale} onChange={setImageScale} min={20} max={200} unit="%" />
                  <CfsSlider label="X Position" value={imageX} onChange={setImageX} min={-140} max={140} unit="px" />
                  <CfsSlider label="Y Position" value={imageY} onChange={setImageY} min={-140} max={140} unit="px" />
                  <CfsSlider label="Rotation" value={imageRotation} onChange={setImageRotation} min={-180} max={180} unit="deg" />

                  <div className="cfs-section-heading" style={{ marginTop: 4 }}>Nudge Image</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 100, margin: '0 auto' }}>
                    <span />
                    <button className="cfs-nudge-btn" onClick={() => nudgeImage(0, -10)} title="Up"><IconArrowUp /></button>
                    <span />
                    <button className="cfs-nudge-btn" onClick={() => nudgeImage(-10, 0)} title="Left"><IconArrowLeft /></button>
                    <button className="cfs-nudge-btn" onClick={() => { setImageX(0); setImageY(0); }} title="Center"><IconCenterTarget /></button>
                    <button className="cfs-nudge-btn" onClick={() => nudgeImage(10, 0)} title="Right"><IconArrowRight /></button>
                    <span />
                    <button className="cfs-nudge-btn" onClick={() => nudgeImage(0, 10)} title="Down"><IconArrowDown /></button>
                    <span />
                  </div>
                </div>
              )}

              {/*  ELEMENTS / SHAPES  */}
              {activeTool === TOOL.ELEMENTS && (
                <div className="cfs-section">
                  <div className="cfs-section-heading">Add Elements</div>
                  <div className="cfs-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <button className="cfs-btn cfs-btn-secondary cfs-btn-sm" onClick={addTextLayer} disabled={additionalTextLayers.length + additionalGraphicLayers.length >= LAYER_LIMIT}>
                      + Text Layer
                    </button>
                    <button className="cfs-btn cfs-btn-secondary cfs-btn-sm" onClick={() => addGraphicLayer('Good Vibes')} disabled={additionalTextLayers.length + additionalGraphicLayers.length >= LAYER_LIMIT}>
                      + Graphic
                    </button>
                    <button className="cfs-btn cfs-btn-secondary cfs-btn-sm" onClick={() => setActiveTool(TOOL.UPLOAD)}>
                      + Image
                    </button>
                  </div>

                  <div className="cfs-section-heading" style={{ marginTop: 14 }}>Graphic Stickers (All Events & Holidays)</div>
                  
                  {/* Category Filter Tabs */}
                  <div className="cfs-cat-tabs" style={{ marginBottom: 10 }}>
                    {STICKER_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`cfs-cat-tab ${selectedStickerCat === cat ? 'active' : ''}`}
                        onClick={() => setSelectedStickerCat(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Colorful Multi-Event Graphic Stickers Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      maxHeight: 330,
                      overflowY: 'auto',
                      paddingRight: 4,
                    }}
                  >
                    {STICKER_CATALOG
                      .filter((stk) => selectedStickerCat === 'All' || stk.category === selectedStickerCat)
                      .map((stk) => (
                        <button
                          key={stk.name}
                          type="button"
                          className="cfs-template-card"
                          style={{
                            padding: '10px 4px 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            cursor: 'pointer',
                            borderRadius: 8,
                            position: 'relative',
                          }}
                          onClick={() => addGraphicLayer(stk.name)}
                          disabled={additionalTextLayers.length + additionalGraphicLayers.length >= LAYER_LIMIT}
                          title={`Add ${stk.name} sticker (${stk.event})`}
                        >
                          <DefaultSvgGraphic name={stk.name} size={42} />
                          <span
                            style={{
                              fontSize: 10,
                              marginTop: 6,
                              fontWeight: 600,
                              color: 'var(--cfs-text)',
                              textAlign: 'center',
                              lineHeight: 1.2,
                            }}
                          >
                            {stk.label}
                          </span>
                          <span
                            style={{
                              fontSize: 8.5,
                              color: 'var(--cfs-text-dim)',
                              textAlign: 'center',
                              marginTop: 2,
                            }}
                          >
                            {stk.category}
                          </span>
                        </button>
                      ))}
                  </div>

                  <div className="cfs-section-heading" style={{ marginTop: 12 }}>Quick Layout Presets</div>
                  {[
                    { label: 'Image Top', action: () => { setImageY(-24); setTextY(32); setImageX(0); setTextX(0); } },
                    { label: 'Text Top', action: () => { setTextY(-32); setImageY(24); setImageX(0); setTextX(0); } },
                    { label: 'Side by Side', action: () => { setImageX(-35); setImageY(0); setTextX(35); setTextY(0); } },
                    { label: 'Center All', action: () => { setImageX(0); setImageY(0); setTextX(0); setTextY(0); } },
                  ].map((p) => (
                    <button key={p.label} className="cfs-btn cfs-btn-secondary cfs-btn-sm" style={{ width: '100%', marginBottom: 4 }} onClick={p.action}>
                      {p.label}
                    </button>
                  ))}
                </div>
              )}

              {/*  LAYERS  */}
              {activeTool === TOOL.LAYERS && (
                <div className="cfs-section">
                  <div className="cfs-section-heading">Design Layers</div>
                  <div className="cfs-layer-list">
                    {/* Layer: uploaded image */}
                    <div className="cfs-layer-row" onClick={() => setActiveTool(TOOL.IMAGE_ADJUST)}>
                      <span className="cfs-layer-icon"><IconLayers size={14} /></span>
                      <span className="cfs-layer-name">{uploadedImageUrl ? 'Artwork Image' : 'Graphic Vector'}</span>
                      <div className="cfs-layer-actions">
                        <button className="cfs-btn-icon cfs-btn-xs" title="Edit" onClick={(e) => { e.stopPropagation(); setActiveTool(TOOL.IMAGE_ADJUST); }}>Edit</button>
                      </div>
                    </div>

                    {/* Additional graphic layers */}
                    {additionalGraphicLayers.map((layer, idx) => (
                      <div key={layer.id} className="cfs-layer-row">
                      <span className="cfs-layer-icon"><IconLayers size={14} /></span>
                        <span className="cfs-layer-name">{layer.name}</span>
                        <div className="cfs-layer-actions">
                        <button className="cfs-btn-icon cfs-btn-xs" disabled={idx === 0} onClick={() => moveLayer(additionalGraphicLayers, setAdditionalGraphicLayers, layer.id, -1)} title="Move Up"><IconArrowUp /></button>
                          <button className="cfs-btn-icon cfs-btn-xs" onClick={() => updateGraphicLayer(layer.id, { visible: layer.visible === false })}>
                        {layer.visible === false ? 'Hidden' : 'Visible'}
                          </button>
                          <button className="cfs-btn-icon cfs-btn-xs" style={{ color: '#ef4444' }} onClick={() => setAdditionalGraphicLayers((ls) => ls.filter((l) => l.id !== layer.id))} title="Delete">&times;</button>
                        </div>
                      </div>
                    ))}

                    {/* Main text layer */}
                    <div className="cfs-layer-row" onClick={() => setActiveTool(TOOL.TEXT)}>
                      <span className="cfs-layer-icon"><IconLayers size={14} /></span>
                      <span className="cfs-layer-name">{customText || 'Main Text'}</span>
                      <div className="cfs-layer-actions">
                        <button className="cfs-btn-icon cfs-btn-xs" title="Edit" onClick={(e) => { e.stopPropagation(); setActiveTool(TOOL.TEXT); }}>Edit</button>
                      </div>
                    </div>

                    {/* Additional text layers */}
                    {additionalTextLayers.map((layer, idx) => (
                      <div key={layer.id} className="cfs-layer-row">
                      <span className="cfs-layer-icon"><IconLayers size={14} /></span>
                        <span className="cfs-layer-name">{layer.text || layer.name}</span>
                        <div className="cfs-layer-actions">
                        <button className="cfs-btn-icon cfs-btn-xs" disabled={idx === 0} onClick={() => moveLayer(additionalTextLayers, setAdditionalTextLayers, layer.id, -1)} title="Move Up"><IconArrowUp /></button>
                          <button className="cfs-btn-icon cfs-btn-xs" onClick={() => updateTextLayer(layer.id, { visible: layer.visible === false })}>
                        {layer.visible === false ? 'Hidden' : 'Visible'}
                          </button>
                          <button className="cfs-btn-icon cfs-btn-xs" style={{ color: '#ef4444' }} onClick={() => setAdditionalTextLayers((ls) => ls.filter((l) => l.id !== layer.id))} title="Delete">&times;</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Extra layer controls (visible in expanded panel) */}
                  {additionalTextLayers.map((layer) => (
                    <div key={`ctrl-${layer.id}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 10px' }}>
                      <div className="cfs-text-sm" style={{ marginBottom: 6, fontWeight: 600, color: 'var(--cfs-text)' }}>
                        {layer.name}
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <label className="cfs-label">Text</label>
                        <input className="cfs-input" value={layer.text} onChange={(e) => updateTextLayer(layer.id, { text: e.target.value })} maxLength={200} />
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <label className="cfs-label">Font</label>
                        <select className="cfs-select" value={layer.font} onChange={(e) => updateTextLayer(layer.id, { font: e.target.value })}>
                          {FONT_CATEGORIES.map((cat) => (
                            <optgroup key={cat.category} label={cat.category}>
                              {cat.fonts.map((f) => (
                                <option
                                  key={f.value}
                                  value={f.value}
                                  style={{ fontFamily: `'${f.value}', ${f.fallback}` }}
                                >
                                  {f.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <CfsSlider label="Scale" value={layer.scale} onChange={(v) => updateTextLayer(layer.id, { scale: v })} min={20} max={200} unit="%" />
                      <CfsSlider label="X" value={layer.x} onChange={(v) => updateTextLayer(layer.id, { x: v })} min={-140} max={140} unit="px" />
                      <CfsSlider label="Y" value={layer.y} onChange={(v) => updateTextLayer(layer.id, { y: v })} min={-140} max={140} unit="px" />
                      <CfsSlider label="Rotation" value={layer.rotation} onChange={(v) => updateTextLayer(layer.id, { rotation: v })} min={-180} max={180} unit="deg" />
                    </div>
                  ))}

                  {/* Graphic sticker layer controls */}
                  {additionalGraphicLayers.map((layer) => (
                    <div key={`ctrl-${layer.id}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 10px', marginTop: 8 }}>
                      <div className="cfs-row-between" style={{ marginBottom: 6 }}>
                        <span className="cfs-text-sm" style={{ fontWeight: 600, color: 'var(--cfs-text)' }}>
                          {layer.name}
                        </span>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: layer.color || textColor, display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)' }} />
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label className="cfs-label">Color</label>
                        <div className="cfs-swatches" style={{ gap: 4 }}>
                          {COLOR_PALETTE.slice(0, 8).map((c) => (
                            <button
                              key={c.hex}
                              type="button"
                              className={`cfs-swatch ${layer.color === c.hex ? 'active' : ''}`}
                              style={{ backgroundColor: c.hex, width: 20, height: 20 }}
                              onClick={() => updateGraphicLayer(layer.id, { color: c.hex })}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>
                      <CfsSlider label="Scale" value={layer.scale ?? 55} onChange={(v) => updateGraphicLayer(layer.id, { scale: v })} min={20} max={200} unit="%" />
                      <CfsSlider label="X Position" value={layer.x ?? 0} onChange={(v) => updateGraphicLayer(layer.id, { x: v })} min={-140} max={140} unit="px" />
                      <CfsSlider label="Y Position" value={layer.y ?? 0} onChange={(v) => updateGraphicLayer(layer.id, { y: v })} min={-140} max={140} unit="px" />
                      <CfsSlider label="Rotation" value={layer.rotation ?? 0} onChange={(v) => updateGraphicLayer(layer.id, { rotation: v })} min={-180} max={180} unit="deg" />
                    </div>
                  ))}
                </div>
              )}

              {/*  PRODUCTS CATALOG  */}
              {activeTool === TOOL.PRODUCTS && (
                <div className="cfs-section">
                  <div className="cfs-section-heading">Choose Product</div>
                  <div className="cfs-cat-tabs">
                    {productCategories.map((cat) => (
                      <button
                        key={cat}
                        className={`cfs-cat-tab ${selectedCategory === cat ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedCategory(cat);
                          if (cat !== 'all') {
                            const first = products.find((p) => (p.category || p.productType || 'Other') === cat);
                            if (first) handleProductSelect(first.id);
                          }
                        }}
                      >
                    {cat === 'all' ? 'All' : cat}
                      </button>
                    ))}
                  </div>

                  <div className="cfs-product-grid">
                    {filteredProducts.map((prod) => (
                      <div
                        key={prod.id}
                        className={`cfs-product-thumb ${prod.id === selectedProductId ? 'active' : ''}`}
                        onClick={() => {
                          if (prod.id === '__custom__') return; // handled below
                          handleProductSelect(prod.id);
                        }}
                      >
                        <img src={prod.image} alt={prod.name} />
                        <div className="cfs-product-thumb-name">{prod.name}</div>
                      </div>
                    ))}
                  </div>

                  {/* External / custom product entry */}
                  <div className="cfs-divider" />
                  <div className="cfs-section-heading">Add External Product</div>
                  <p className="cfs-text-xs" style={{ lineHeight: 1.5 }}>
                    Link a product not yet in your store. It will be treated as a custom base product on the canvas.
                  </p>
                  <div>
                    <label className="cfs-label">Product Name</label>
                    <input className="cfs-input" value={customProductName} onChange={(e) => setCustomProductName(e.target.value)} placeholder="e.g. Premium Bomber Jacket" />
                  </div>
                  <div>
                    <label className="cfs-label">Mockup URL (optional)</label>
                    <input className="cfs-input" value={customProductUrl} onChange={(e) => setCustomProductUrl(e.target.value)} placeholder="https://.../product-mockup.jpg" />
                  </div>
                  <button
                    className="cfs-btn cfs-btn-primary cfs-btn-sm"
                    style={{ width: '100%' }}
                    disabled={!customProductName.trim()}
                    onClick={() => {
                      if (!customProductName.trim()) return;
                      const newId = `custom_${Date.now()}`;
                      const newProd = {
                        id: newId,
                        category: 'Custom',
                        name: customProductName.trim(),
                        subtitle: 'External / custom base product',
                        price: '$0.00',
                        colors: ['#ffffff'],
                        colorNames: ['Default'],
                        image: customProductUrl.trim() || whiteTshirtImg,
                        compatibleTechniques: ['dtg', 'uv_print'],
                      };
                      setCustomProducts((prev) => [newProd, ...prev]);
                      setSelectedProductId(newId);
                      setSelectedCategory('Custom');
                      addToast('info', 'Custom Product Added', `"${newProd.name}" loaded on canvas as a custom base.`);
                      setCustomProductName('');
                      setCustomProductUrl('');
                    }}
                  >
                    Load on Canvas
                  </button>

                  {/* Shopify variant status */}
                  {activeProduct.storeProductId && variantsLoadingProductId === activeProduct.id && (
                    <div className="cfs-row" style={{ gap: 6, padding: '6px 0' }}>
                      <span className="cfs-spinner" />
                      <span className="cfs-text-sm">Loading Shopify variants...</span>
                    </div>
                  )}
                  {variantsLoadError && (
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#ef4444' }}>
                      {variantsLoadError}
                      <button className="cfs-btn cfs-btn-ghost cfs-btn-xs" style={{ marginLeft: 8 }} onClick={() => loadProductVariants(activeProduct.id).catch(() => {})}>
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

        {/*  Center Canvas Area  */}
        <div className="cfs-canvas-area">
          {/* Canvas toolbar (zoom / guides quick buttons) */}
          <div className="cfs-canvas-toolbar">
            <span className="cfs-badge cfs-badge-muted">{activeProduct.name}</span>
            <span className="cfs-badge cfs-badge-accent">{activePrintArea.label} - {activePrintArea.dimensions}</span>
            <span style={{ flex: 1 }} />
            <button className="cfs-btn cfs-btn-ghost cfs-btn-xs" onClick={() => {
              setCustomText('Good Vibes');
              setSelectedFont('Poppins');
              setSelectedEffect('curve');
              setTextScale(85); setTextX(0); setTextY(32); setTextRotation(0);
              setImageScale(90); setImageX(0); setImageY(-24); setImageRotation(0);
              handleResetFilters();
            }}>
              Reset Canvas
            </button>
          </div>

          <div className="cfs-canvas-scroll">
            <CanvasStage
              activeProduct={activeProduct}
              activeProductImage={activeProductImage}
              selectedColorIndex={selectedColorIndex}
              customText={customText}
              fontFamily={selectedFont}
              textColor={textColor}
              isBold={isBold}
              isItalic={isItalic}
              isUnderline={isUnderline}
              alignment={alignment}
              effect={selectedEffect}
              imageScale={imageScale}
              imageX={imageX}
              imageY={imageY}
              imageRotation={imageRotation}
              textScale={textScale}
              textX={textX}
              textY={textY}
              textRotation={textRotation}
              uploadedImageUrl={uploadedImageUrl}
              uploadedFileName={uploadedImageUrl ? null : uploadedFileName}
              uploadedImages={getSyncedUploadedImages()}
              selectedImageId={selectedImageId}
              additionalTextLayers={additionalTextLayers}
              additionalGraphicLayers={additionalGraphicLayers}
              imgBrightness={imgBrightness}
              imgContrast={imgContrast}
              imgSaturation={imgSaturation}
              imgHueRotate={imgHueRotate}
              imgOpacity={imgOpacity}
              imgBlendMode={imgBlendMode}
              imgDropShadow={imgDropShadow}
              showGuides={showGuides}
              canvasWidth={canvasW}
              canvasHeight={canvasH}
            />
          </div>

          {/* Canvas spec footer */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--cfs-border)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'var(--cfs-text-dim)' }}>
            <span>{activeProduct.name}</span>
            <span>-</span>
            <span>{selectedColorName}</span>
            <span>-</span>
            <span>Text {textScale}%</span>
            <span>-</span>
            <span>Image {imageScale}%</span>
            <span>-</span>
            <span>Brightness {imgBrightness}%</span>
            {imgBlendMode !== 'normal' && <><span>-</span><span>Blend: {imgBlendMode}</span></>}
          </div>
        </div>

        {/*  Right Properties Panel  */}
        <div className="cfs-right-panel">
          <div className="cfs-right-panel-header">
            <div className="cfs-row-between">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cfs-text)' }}>Product</span>
              <span className="cfs-badge cfs-badge-accent">Studio</span>
            </div>
          </div>
          <div className="cfs-right-panel-body">

            {/* Product Info Card */}
            <div className="cfs-product-info-card">
              <img src={activeProductImage || activeProduct.image} alt={activeProduct.name} className="cfs-product-info-img" />
              <div className="cfs-product-info-body">
                <div className="cfs-product-name">{activeProduct.name}</div>
                <div className="cfs-product-subtitle">{activeProduct.subtitle}</div>
                <label className="cfs-price-field" htmlFor="custom-product-price">
                  <span>Custom price</span>
                  <span className="cfs-price-input-wrap">
                    <span>$</span>
                    <input
                      id="custom-product-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={customProductPrice}
                      onChange={(event) => setCustomProductPrice(event.target.value)}
                    />
                  </span>
                </label>
                <div className="cfs-product-price">
                  {Number.isFinite(Number(customProductPrice)) && customProductPrice !== ''
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: activeProduct.currencyCode || 'USD' }).format(Number(customProductPrice))
                    : '-'}
                </div>
              </div>
            </div>

            {/* Color Picker */}
            {colorOption && (
              <div className="cfs-section">
                <div className="cfs-section-heading">{colorOption.name}</div>
                <div className="cfs-swatch-row">
                  {colorOption.values.map((colorName, idx) => (
                    <button
                      key={colorName}
                      className={`cfs-swatch ${selectedColorName === colorName ? 'active' : ''}`}
                      title={colorName}
                      style={{
                        backgroundColor: activeProduct.colors[idx] || '#ccc',
                        border: activeProduct.colors[idx] === '#ffffff' ? '1px solid rgba(255,255,255,0.2)' : undefined,
                      }}
                      onClick={() => handleProductOptionChange(colorOption.name, colorName)}
                    />
                  ))}
                </div>
                <div className="cfs-text-xs" style={{ color: 'var(--cfs-text-muted)' }}>{selectedColorName}</div>
              </div>
            )}

            {/* Size Selector */}
            {sizeOption && (
              <div className="cfs-section">
                <div className="cfs-section-heading">{sizeOption.name}</div>
                <div className="cfs-seg">
                  {sizeOption.values.map((size) => (
                    <button
                      key={size}
                      className={`cfs-seg-btn ${selectedSize === size ? 'active' : ''}`}
                      onClick={() => handleProductOptionChange(sizeOption.name, size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Other options */}
            {otherProductOptions.map((opt) => (
              <div key={opt.name} className="cfs-section">
                <div className="cfs-section-heading">{opt.name}</div>
                <select
                  className="cfs-select"
                  value={selectedOptionValues[opt.name] || opt.values[0]}
                  onChange={(e) => handleProductOptionChange(opt.name, e.target.value)}
                >
                  {opt.values.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            ))}

            {/* Variant warning */}
            {!variantSelectionValid && variantMatrixLoaded && !variantsLoadError && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#ef4444' }}>
                Selected combination has no matching Shopify variant.
              </div>
            )}

            <div className="cfs-divider" />

            <button
              className="cfs-btn cfs-btn-secondary"
              style={{ width: '100%' }}
              onClick={handleSaveDesign}
              disabled={isSaving}
            >
              {isSaving ? <><span className="cfs-spinner" /> Saving...</> : <><IconSave /> Save Design</>}
            </button>

            <button
              className="cfs-btn cfs-btn-ghost"
              style={{ width: '100%' }}
              onClick={() => setVersionCompareOpen(true)}
            >
              - Version History
            </button>

            <div className="cfs-divider" />

            {/* Product switcher shortcut */}
            <div className="cfs-section">
              <div className="cfs-section-heading">Switch Product</div>
              <select
                className="cfs-select"
                value={selectedProductId}
                onChange={(e) => handleProductSelect(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.price ? ` (${p.price})` : ''}</option>
                ))}
              </select>
              <button className="cfs-btn cfs-btn-secondary cfs-btn-sm" style={{ width: '100%' }} onClick={() => setActiveTool(TOOL.PRODUCTS)}>
                Browse Full Catalog
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* ---------------- MODALS ---------------- */}
 
      {/* Version History Modal (Polaris - untouched) */}
      <VersionComparisonModal
        open={versionCompareOpen}
        onClose={() => setVersionCompareOpen(false)}
        versions={versionHistory}
        loading={versionHistoryLoading}
        error={versionHistoryError}
        isSaving={isSaving}
        productName={products.find((p) => p.id === historyModalProductId)?.name || activeProduct.name}
        currentProductId={historyModalProductId}
        products={products.map((p) => ({ label: p.name, value: p.id }))}
        onProductChange={handleModalProductChange}
        onRestoreVersion={handleRestoreVersion}
        onCreateSnapshot={handleCreateSnapshot}
        onLoadVersion={loadVersionDetail}
      />

      {/* Publish to Storefront Modal (Polaris - untouched) */}
      <PublishToStorefrontModal
        open={publishOpen}
        product={{ ...activeProduct, image: activeProductImage }}
        colorName={activeProduct.colorNames?.[selectedColorIndex] || 'Default'}
        size={selectedSize}
        options={activeProductOptions.map((o) => ({
          name: o.name,
          value: selectedOptionValues[o.name] || o.values[0],
        }))}
        isStoreProduct={Boolean(activeProduct.storeProductId)}
        technique={activeProduct.compatibleTechniques?.[0] || 'dtg'}
        customText={customText}
        customPrice={customProductPrice}
        onCustomPriceChange={setCustomProductPrice}
        collections={collections}
        collectionsLoading={collectionsLoading}
        collectionsError={collectionsError}
        collectionChoice={collectionChoice}
        newCollectionName={newCollectionName}
        collectionNameError={collectionNameError}
        publishing={isPublishing}
        variantAvailable={variantSelectionValid}
        onCollectionChoiceChange={handleCollectionChoiceChange}
        onNewCollectionNameChange={(v) => { setNewCollectionName(v); setCollectionNameError(''); }}
        onRetryCollections={loadShopifyCollections}
        onClose={() => setPublishOpen(false)}
        onPublish={handlePublishToStorefront}
      />

      {/* Toast notifications */}
      <CfsToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

CustomizerEditor.propTypes = {
  storeProducts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    options: PropTypes.array,
    variants: PropTypes.array,
  })),
  catalogError: PropTypes.string,
};
