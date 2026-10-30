import PropTypes from 'prop-types';
import DefaultSvgGraphic from './DefaultSvgGraphic';
import whiteTshirtImg from '../assets/mockups/white_tshirt.jpg';
import blackTshirtImg from '../assets/mockups/black_tshirt.jpg';
import hoodieImg from '../assets/mockups/hoodie.jpg';
import mugImg from '../assets/mockups/mug.jpg';
import phoneCaseImg from '../assets/mockups/phone_case.jpg';

/**
 * DesignMockupPreview
 *
 * Professional studio product preview component for CustomForge.
 * Renders authentic, high-resolution product photography (t-shirts, hoodies, mugs, phone cases)
 * with a realistic front printable zone and live typography/artwork customization.
 *
 * Features:
 * - 100% clean product mockup images (no human models or stray portraits)
 * - Dynamic garment color switching (White, Black, Navy, Crimson, Charcoal)
 * - Real-time typography rendering (custom text, fonts, colors, scale, alignment, bold/italic/underline)
 * - Typography effects (Curve, Shadow, Outline, Clean)
 * - Vector artwork / graphic badge rendering for templates & uploaded graphics
 * - Visual "DTG Safe Print Zone" guidelines with corner registration marks (toggleable)
 * - Fully backwards-compatible with all existing app pages (ProofApproval, Templates, Orders, CustomerDesigns)
 */

export const MOCKUP_IMAGES = {
  whiteTshirt: whiteTshirtImg,
  blackTshirt: blackTshirtImg,
  hoodie: hoodieImg,
  mug: mugImg,
  phoneCase: phoneCaseImg,
};

// Built-in vector graphics for design templates, festive stickers, and foreign event artwork
function TemplateVectorGraphic({ templateName, stickerId, color = '#111827', width = 120, height = 90 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width, height }}>
      <DefaultSvgGraphic name={templateName} stickerId={stickerId} color={color} size={Math.min(width, height ? height * 1.25 : width)} />
    </div>
  );
}

TemplateVectorGraphic.propTypes = {
  templateName: PropTypes.string,
  stickerId: PropTypes.string,
  color: PropTypes.string,
  width: PropTypes.number,
  height: PropTypes.number,
};

const HEIGHT_PRESETS = {
  sm: '220px',
  md: '320px',
  lg: '460px',
};

// Safe print zone placement for each substrate
const PRINT_ZONES = {
  tshirt: {
    top: '26%',
    left: '26%',
    width: '48%',
    height: '42%',
    label: 'Front Print Zone (250 × 300 mm)',
  },
  hoodie: {
    top: '30%',
    left: '28%',
    width: '44%',
    height: '34%',
    label: 'Chest Print Zone (260 × 240 mm)',
  },
  mug: {
    top: '25%',
    left: '20%',
    width: '40%',
    height: '48%',
    label: 'Cylinder Wrap Zone (80 × 90 mm)',
  },
  phone_case: {
    top: '34%',
    left: '24%',
    width: '52%',
    height: '52%',
    label: 'Back Plate Zone (70 × 110 mm)',
  },
  general: {
    top: '20%',
    left: '20%',
    width: '60%',
    height: '60%',
    label: 'Main Print Zone',
  },
};

export default function DesignMockupPreview({
  productId,
  productType,
  productImage,
  printArea,
  productColor = '#ffffff',
  productColorName = '',
  productLabel = '',
  // Design content
  customText,
  designText,
  graphicText,
  designImage,
  uploadedFileName,
  // Typography styling
  fontFamily = 'Poppins',
  textColor = '#111827',
  isBold = true,
  isItalic = false,
  isUnderline = false,
  alignment = 'center',
  effect = 'curve',
  scale = 85,
  // Independent Image & Graphic Adjustments
  imageScale,
  imageX = 0,
  imageY,
  imageRotation = 0,
  // Independent Text Adjustments
  textScale,
  textX = 0,
  textY,
  textRotation = 0,
  additionalTextLayers = [],
  additionalGraphicLayers = [],
  additionalImageLayers = [],
  // Component layout
  size = 'md',
  height,
  angle,
  designOnly = false,
}) {
  // Normalize text from any prop name used across screens
  const displayText = (customText || designText || graphicText || '').trim();
  const hasImage = Boolean(designImage || uploadedFileName);

  // Compute effective scales (independent or fallback to global scale)
  const effectiveImageScale = imageScale !== undefined ? imageScale : scale;
  const effectiveTextScale = textScale !== undefined ? textScale : scale;

  // Compute effective offsets (stacked naturally if both present, centered if alone)
  const effectiveImageX = imageX !== undefined ? imageX : 0;
  const effectiveImageY = imageY !== undefined ? imageY : (displayText ? -24 : 0);
  const effectiveTextX = textX !== undefined ? textX : 0;
  const effectiveTextY = textY !== undefined ? textY : (hasImage ? 32 : 0);

  // Determine product category
  const rawId = (productId || productType || productLabel || '').toLowerCase();
  let resolvedCategory = 'general';
  if (rawId.includes('hoodie')) resolvedCategory = 'hoodie';
  else if (rawId.includes('mug') || rawId.includes('drinkware')) resolvedCategory = 'mug';
  else if (rawId.includes('phone') || rawId.includes('case')) resolvedCategory = 'phone_case';
  else if (/\b(t-?shirts?|shirts?|tops?)\b/i.test(productType || '')) resolvedCategory = 'tshirt';
  else if (/\b(hoodies?|sweatshirts?)\b/i.test(productType || '')) resolvedCategory = 'hoodie';
  else if (/\b(mugs?|drinkware|glassware|bottles?)\b/i.test(productType || '')) resolvedCategory = 'mug';
  else if (/\b(phone|tablet)\s*cases?\b/i.test(productType || '')) resolvedCategory = 'phone_case';

  // Determine garment color state
  const colorStr = (productColor || '').toLowerCase();
  const colorNameStr = (productColorName || '').toLowerCase();
  const isDarkColor =
    colorStr === '#18181b' ||
    colorStr === '#111827' ||
    colorStr === '#000000' ||
    colorStr === '#374151' ||
    colorNameStr.includes('black') ||
    colorNameStr.includes('charcoal') ||
    colorNameStr.includes('dark');

  const isNavy = colorStr === '#1e3a8a' || colorNameStr.includes('navy');
  const isCrimson = colorStr === '#991b1b' || colorNameStr.includes('crimson') || colorNameStr.includes('red');
  const isForestGreen = colorStr === '#15803d' || colorNameStr.includes('green');

  // Choose appropriate clean base product image
  let baseMockupImg = productImage || whiteTshirtImg;
  if (productImage) {
    baseMockupImg = productImage;
  } else if (resolvedCategory === 'tshirt') {
    if (isDarkColor) {
      baseMockupImg = blackTshirtImg;
    } else {
      baseMockupImg = whiteTshirtImg;
    }
  } else if (resolvedCategory === 'hoodie') {
    baseMockupImg = hoodieImg;
  } else if (resolvedCategory === 'mug') {
    baseMockupImg = mugImg;
  } else if (resolvedCategory === 'phone_case') {
    baseMockupImg = phoneCaseImg;
  }

  // Adjust text contrast if user hasn't explicitly customized text color on a dark garment
  let effectiveTextColor = textColor;
  if ((isDarkColor || isNavy || isCrimson || isForestGreen) && (textColor === '#111827' || textColor === '#18181b')) {
    effectiveTextColor = '#ffffff';
  }

  // Effect styles
  let textShadow = 'none';
  let textStroke = 'none';
  if (effect === 'shadow') {
    textShadow = isDarkColor
      ? '0 3px 8px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)'
      : '0 3px 6px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.2)';
  } else if (effect === 'outline') {
    textStroke = isDarkColor ? '1.2px #ffffff' : '1.2px #111827';
  }

  const defaultZone = PRINT_ZONES[resolvedCategory] || PRINT_ZONES.general;
  const zone = printArea
    ? {
      ...defaultZone,
      top: `${printArea.top * 100}%`,
      left: `${printArea.left * 100}%`,
      width: `${printArea.width * 100}%`,
      height: `${printArea.height * 100}%`,
    }
    : defaultZone;
  const previewZone = designOnly
    ? { top: '8%', left: '8%', width: '84%', height: '84%' }
    : zone;
  const containerHeight = height ? (typeof height === 'number' ? `${height}px` : height) : HEIGHT_PRESETS[size] || HEIGHT_PRESETS.md;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: containerHeight,
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: designOnly ? '#ffffff' : '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── BASE PRODUCT GARMENT IMAGE ── */}
      {!designOnly && <img
        src={baseMockupImg}
        alt={productLabel || `${resolvedCategory} mockup`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center',
          pointerEvents: 'none',
        }}
        loading="lazy"
      />}

      {/* ── DYNAMIC COLOR TINT OVERLAY ACROSS ALL PRODUCTS ── */}
      {!designOnly && !productImage && resolvedCategory === 'tshirt' && (isNavy || isCrimson) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: isNavy ? '#1e3a8a' : '#991b1b',
            mixBlendMode: 'multiply',
            opacity: 0.88,
            pointerEvents: 'none',
            maskImage: `radial-gradient(circle at 50% 50%, black 60%, transparent 95%)`,
            WebkitMaskImage: `radial-gradient(circle at 50% 50%, black 60%, transparent 95%)`,
          }}
        />
      )}
      {!designOnly && !productImage && resolvedCategory === 'hoodie' && isForestGreen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#15803d',
            mixBlendMode: 'multiply',
            opacity: 0.85,
            pointerEvents: 'none',
            maskImage: `radial-gradient(circle at 50% 50%, black 60%, transparent 95%)`,
            WebkitMaskImage: `radial-gradient(circle at 50% 50%, black 60%, transparent 95%)`,
          }}
        />
      )}
      {!designOnly && !productImage && resolvedCategory === 'hoodie' && isDarkColor && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#18181b',
            mixBlendMode: 'multiply',
            opacity: 0.88,
            pointerEvents: 'none',
            maskImage: `radial-gradient(circle at 50% 50%, black 60%, transparent 95%)`,
            WebkitMaskImage: `radial-gradient(circle at 50% 50%, black 60%, transparent 95%)`,
          }}
        />
      )}
      {!designOnly && !productImage && resolvedCategory === 'mug' && colorStr === '#0284c7' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#0284c7',
            mixBlendMode: 'multiply',
            opacity: 0.8,
            pointerEvents: 'none',
            maskImage: `radial-gradient(circle at 50% 50%, black 50%, transparent 90%)`,
            WebkitMaskImage: `radial-gradient(circle at 50% 50%, black 50%, transparent 90%)`,
          }}
        />
      )}
      {!designOnly && !productImage && resolvedCategory === 'phone_case' && (colorStr === '#d97706' || colorNameStr.includes('amber')) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#d97706',
            mixBlendMode: 'multiply',
            opacity: 0.8,
            pointerEvents: 'none',
            maskImage: `radial-gradient(circle at 50% 50%, black 50%, transparent 90%)`,
            WebkitMaskImage: `radial-gradient(circle at 50% 50%, black 50%, transparent 90%)`,
          }}
        />
      )}

      {/* ── PRINT ZONE CONTAINER (Positioned accurately on product chest/face) ── */}
      <div
        style={{
          position: 'absolute',
          top: previewZone.top,
          left: previewZone.left,
          width: previewZone.width,
          height: previewZone.height,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          overflow: 'hidden',
          transition: 'all 0.15s ease-out',
        }}
      >
        {/* ── ALL UPLOADED IMAGES / GRAPHIC LAYER ── */}
        {additionalImageLayers && additionalImageLayers.length > 0 ? (
          additionalImageLayers
            .filter((img) => img.visible !== false && img.url)
            .map((img) => {
              const s = Number(img.scale) || 80;
              const x = Number(img.x) || 0;
              const y = Number(img.y) || 0;
              const rot = Number(img.rotation) || 0;
              return (
                <div
                  key={img.id}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rot}deg)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <img
                    src={img.url}
                    alt={img.name || 'Uploaded Artwork'}
                    style={{
                      maxWidth: '180px',
                      maxHeight: `${Math.round(130 * (s / 100))}px`,
                      width: `${Math.round(110 * (s / 100))}px`,
                      height: 'auto',
                      objectFit: 'contain',
                      filter: isDarkColor ? 'brightness(1.1)' : 'none',
                      display: 'block',
                      transition: 'all 0.1s ease-out',
                    }}
                  />
                </div>
              );
            })
        ) : (
          (designImage || uploadedFileName) && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${effectiveImageX}px), calc(-50% + ${effectiveImageY}px)) rotate(${imageRotation}deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.08s ease-out',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            >
              {designImage ? (
                <img
                  src={designImage}
                  alt="Uploaded Artwork"
                  style={{
                    maxWidth: '180px',
                    maxHeight: `${Math.round(130 * (effectiveImageScale / 100))}px`,
                    width: `${Math.round(110 * (effectiveImageScale / 100))}px`,
                    height: 'auto',
                    objectFit: 'contain',
                    filter: isDarkColor ? 'brightness(1.1)' : 'none',
                    display: 'block',
                    transition: 'all 0.1s ease-out',
                  }}
                />
              ) : (
                <div style={{ opacity: 0.95, overflow: 'hidden', transition: 'all 0.1s ease-out' }}>
                  <TemplateVectorGraphic
                    templateName={uploadedFileName || displayText || 'Good Vibes'}
                    color={effectiveTextColor}
                    width={Math.round(60 * (effectiveImageScale / 100) + 20)}
                    height={Math.round(45 * (effectiveImageScale / 100) + 10)}
                  />
                </div>
              )}
            </div>
          )
        )}

        {additionalGraphicLayers.filter((layer) => layer.visible !== false).map((layer) => (
          <div
            key={layer.id}
            aria-label={`${layer.name || 'Graphic layer'} sticker`}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${Number(layer.x) || 0}px), calc(-50% + ${Number(layer.y) || 0}px)) rotate(${Number(layer.rotation) || 0}deg)`,
              zIndex: 3,
              pointerEvents: 'none',
            }}
          >
            <TemplateVectorGraphic
              templateName={layer.name}
              stickerId={layer.stickerId}
              color={layer.color || '#111827'}
              width={Math.round(100 * (Number(layer.scale) || 55) / 100)}
              height={Math.round(80 * (Number(layer.scale) || 55) / 100)}
            />
          </div>
        ))}

        {/* ── INDEPENDENT TYPOGRAPHIC TEXT LAYER ── */}
        {displayText && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${effectiveTextX}px), calc(-50% + ${effectiveTextY}px)) rotate(${textRotation}deg)`,
              width: '100%',
              display: 'flex',
              justifyContent: alignment === 'left' ? 'flex-start' : alignment === 'right' ? 'flex-end' : 'center',
              transition: 'transform 0.08s ease-out',
              zIndex: 3,
              pointerEvents: 'none',
              mixBlendMode: isDarkColor ? 'normal' : 'multiply',
            }}
          >
            {effect === 'curve' ? (
              <svg
                viewBox="0 0 260 70"
                style={{
                  width: '100%',
                  maxWidth: `${Math.round(140 * (effectiveTextScale / 100) + 40)}px`,
                  height: `${Math.round(36 * (effectiveTextScale / 100) + 10)}px`,
                  overflow: 'hidden',
                  display: 'block',
                  transition: 'all 0.1s ease-out',
                }}
              >
                <defs>
                  <path
                    id="textCurvePath"
                    d="M 20,55 Q 130,10 240,55"
                    fill="transparent"
                  />
                </defs>
                <text
                  style={{
                    fontFamily: `${fontFamily}, sans-serif`,
                    fontSize: `${Math.round(16 * (effectiveTextScale / 100) + 4)}px`,
                    fontWeight: isBold ? 800 : 500,
                    fontStyle: isItalic ? 'italic' : 'normal',
                    letterSpacing: '0.08em',
                    fill: effectiveTextColor,
                    filter: textShadow !== 'none' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'none',
                  }}
                >
                  <textPath
                    href="#textCurvePath"
                    startOffset="50%"
                    textAnchor="middle"
                  >
                    {displayText}
                  </textPath>
                </text>
              </svg>
            ) : (
              <span
                style={{
                  fontFamily: `${fontFamily}, sans-serif`,
                  fontSize: `${Math.round(14 * (effectiveTextScale / 100) + 2)}px`,
                  fontWeight: isBold ? 700 : 500,
                  fontStyle: isItalic ? 'italic' : 'normal',
                  textDecoration: isUnderline ? 'underline' : 'none',
                  color: effectiveTextColor,
                  textAlign: alignment,
                  lineHeight: 1.2,
                  letterSpacing: '0.04em',
                  textShadow: textShadow,
                  WebkitTextStroke: textStroke,
                  display: 'block',
                  padding: '2px 8px',
                  wordBreak: 'break-word',
                  transition: 'all 0.1s ease-out',
                }}
              >
                {displayText}
              </span>
            )}
          </div>
        )}

        {additionalTextLayers.filter((layer) => layer.visible !== false).map((layer) => (
          <div
            key={layer.id}
            aria-label={`${layer.name || 'Text layer'}: ${layer.text}`}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${Number(layer.x) || 0}px), calc(-50% + ${Number(layer.y) || 0}px)) rotate(${Number(layer.rotation) || 0}deg)`,
              zIndex: 4,
              maxWidth: '95%',
              color: layer.color || '#111827',
              fontFamily: `${layer.font || 'Poppins'}, sans-serif`,
              fontSize: `${Math.max(10, Math.round(15 * (Number(layer.scale) || 100) / 100))}px`,
              fontWeight: layer.bold === false ? 500 : 700,
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              pointerEvents: 'none',
              mixBlendMode: isDarkColor ? 'normal' : 'multiply',
            }}
          >
            {layer.text}
          </div>
        ))}
      </div>

      {/* ── TOP-RIGHT STUDIO OVERLAYS & CONTROLS ── */}
      {angle && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            display: 'flex',
            gap: '6px',
            zIndex: 10,
          }}
        >
          <span
            style={{
              background: 'rgba(17, 24, 39, 0.75)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: '600',
              letterSpacing: '0.04em',
              padding: '3px 8px',
              borderRadius: '6px',
              backdropFilter: 'blur(4px)',
            }}
          >
            {angle.toUpperCase()}
          </span>
        </div>
      )}

      {/* ── BOTTOM GARMENT INFO CHIP ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '10px',
          background: 'rgba(255, 255, 255, 0.88)',
          color: '#1f2937',
          fontSize: '10px',
          fontWeight: '600',
          padding: '2px 8px',
          borderRadius: '999px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isDarkColor ? '#18181b' : (productColor || '#ffffff'),
            border: '1px solid #d1d5db',
          }}
        />
        <span>{productLabel || `${resolvedCategory.toUpperCase()}`}</span>
      </div>
    </div>
  );
}

DesignMockupPreview.propTypes = {
  productId: PropTypes.string,
  productType: PropTypes.string,
  productImage: PropTypes.string,
  printArea: PropTypes.shape({
    top: PropTypes.number,
    left: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  productColor: PropTypes.string,
  productColorName: PropTypes.string,
  productLabel: PropTypes.string,
  customText: PropTypes.string,
  designText: PropTypes.string,
  graphicText: PropTypes.string,
  designImage: PropTypes.string,
  uploadedFileName: PropTypes.string,
  additionalImageLayers: PropTypes.array,
  fontFamily: PropTypes.string,
  textColor: PropTypes.string,
  isBold: PropTypes.bool,
  isItalic: PropTypes.bool,
  isUnderline: PropTypes.bool,
  alignment: PropTypes.oneOf(['left', 'center', 'right']),
  effect: PropTypes.string,
  scale: PropTypes.number,
  imageScale: PropTypes.number,
  imageX: PropTypes.number,
  imageY: PropTypes.number,
  imageRotation: PropTypes.number,
  textScale: PropTypes.number,
  textX: PropTypes.number,
  textY: PropTypes.number,
  textRotation: PropTypes.number,
  additionalTextLayers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    text: PropTypes.string,
    color: PropTypes.string,
    font: PropTypes.string,
    scale: PropTypes.number,
    x: PropTypes.number,
    y: PropTypes.number,
    rotation: PropTypes.number,
    visible: PropTypes.bool,
  })),
  additionalGraphicLayers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    color: PropTypes.string,
    scale: PropTypes.number,
    x: PropTypes.number,
    y: PropTypes.number,
    rotation: PropTypes.number,
    visible: PropTypes.bool,
  })),
  size: PropTypes.string,
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  angle: PropTypes.string,
};