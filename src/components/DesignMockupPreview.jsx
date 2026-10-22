import React, { useState } from 'react';
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

// Built-in vector graphics for design templates and uploaded artwork
function TemplateVectorGraphic({ templateName, color = '#111827', width = 120, height = 90 }) {
  const norm = (templateName || '').toLowerCase();

  if (norm.includes('mountain') || norm.includes('adventure')) {
    return (
      <svg width={width} height={height} viewBox="0 0 160 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto' }}>
        <path d="M80 15L125 85H35L80 15Z" stroke={color} strokeWidth="5" strokeLinejoin="round" fill="none" />
        <path d="M80 32L95 55L85 62L75 52L65 65L80 32Z" fill={color} opacity="0.85" />
        <path d="M115 50L145 85H85L115 50Z" stroke={color} strokeWidth="4" strokeLinejoin="round" fill="none" opacity="0.7" />
        <path d="M45 55L20 85H70L45 55Z" stroke={color} strokeWidth="4" strokeLinejoin="round" fill="none" opacity="0.7" />
        <line x1="20" y1="92" x2="140" y2="92" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx="80" cy="8" r="4" fill={color} />
      </svg>
    );
  }

  if (norm.includes('beach') || norm.includes('sunset')) {
    return (
      <svg width={width} height={height} viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto' }}>
        <circle cx="70" cy="50" r="38" stroke={color} strokeWidth="4" fill="none" />
        <path d="M35 55Q70 42 105 55" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <path d="M38 65Q70 52 102 65" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <path d="M44 75Q70 66 96 75" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx="70" cy="38" r="14" fill={color} opacity="0.8" />
        <path d="M70 14V20M48 24L52 28M92 24L88 28" stroke={color} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes('skull')) {
    return (
      <svg width={width} height={height} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto' }}>
        <path d="M60 15C42 15 30 28 30 46C30 58 37 68 45 72V85H75V72C83 68 90 58 90 46C90 28 78 15 60 15Z" stroke={color} strokeWidth="4" strokeLinejoin="round" fill="none" />
        <circle cx="48" cy="48" r="7" fill={color} />
        <circle cx="72" cy="48" r="7" fill={color} />
        <path d="M60 58L57 65H63L60 58Z" fill={color} />
        <line x1="52" y1="78" x2="52" y2="85" stroke={color} strokeWidth="3" />
        <line x1="60" y1="78" x2="60" y2="85" stroke={color} strokeWidth="3" />
        <line x1="68" y1="78" x2="68" y2="85" stroke={color} strokeWidth="3" />
      </svg>
    );
  }

  if (norm.includes('logo') || norm.includes('minimal')) {
    return (
      <svg width={width} height={height} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto' }}>
        <polygon points="60,18 95,78 25,78" stroke={color} strokeWidth="5" strokeLinejoin="round" fill="none" />
        <polygon points="60,38 78,70 42,70" fill={color} opacity="0.6" />
        <circle cx="60" cy="18" r="5" fill={color} />
      </svg>
    );
  }

  // Default / "Good Vibes" retro vintage sun & waves insignia
  return (
    <svg width={width} height={height} viewBox="0 0 150 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto' }}>
      {/* Radiant Sun */}
      <circle cx="75" cy="42" r="22" stroke={color} strokeWidth="4" fill="none" />
      <circle cx="75" cy="42" r="14" fill={color} opacity="0.85" />
      {/* Sun rays */}
      <line x1="75" y1="12" x2="75" y2="4" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <line x1="96" y1="21" x2="102" y2="15" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <line x1="105" y1="42" x2="113" y2="42" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <line x1="54" y1="21" x2="48" y2="15" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <line x1="45" y1="42" x2="37" y2="42" stroke={color} strokeWidth="3" strokeLinecap="round" />
      {/* Oceanic ripples below */}
      <path d="M30 72C42 66 52 76 65 72C78 68 88 78 100 72C112 66 120 74 125 72" stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M36 82C46 78 56 86 68 82C80 78 90 86 102 82C112 78 118 84 122 82" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.65" />
    </svg>
  );
}

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
};

export default function DesignMockupPreview({
  productId,
  productType,
  productImage,
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
  // Component layout
  size = 'md',
  height,
  angle,
  showGuides: initialShowGuides = false,
}) {
  const [showGuides, setShowGuides] = useState(false);

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
  let resolvedCategory = 'tshirt';
  if (rawId.includes('hoodie')) resolvedCategory = 'hoodie';
  else if (rawId.includes('mug') || rawId.includes('drinkware')) resolvedCategory = 'mug';
  else if (rawId.includes('phone') || rawId.includes('case')) resolvedCategory = 'phone_case';

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
  const isHeatherGrey = colorStr === '#475569' || colorNameStr.includes('grey') || colorNameStr.includes('gray');
  const isForestGreen = colorStr === '#15803d' || colorNameStr.includes('green');

  // Choose appropriate clean base product image
  let baseMockupImg = whiteTshirtImg;
  if (resolvedCategory === 'tshirt') {
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

  const zone = PRINT_ZONES[resolvedCategory] || PRINT_ZONES.tshirt;
  const containerHeight = height ? (typeof height === 'number' ? `${height}px` : height) : HEIGHT_PRESETS[size] || HEIGHT_PRESETS.md;
  const scaleRatio = Math.max(0.4, Math.min(scale / 100, 1.6));

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: containerHeight,
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── BASE PRODUCT GARMENT IMAGE ── */}
      <img
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
      />

      {/* ── DYNAMIC COLOR TINT OVERLAY ACROSS ALL PRODUCTS ── */}
      {resolvedCategory === 'tshirt' && (isNavy || isCrimson) && (
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
      {resolvedCategory === 'hoodie' && isForestGreen && (
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
      {resolvedCategory === 'hoodie' && isDarkColor && (
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
      {resolvedCategory === 'mug' && colorStr === '#0284c7' && (
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
      {resolvedCategory === 'phone_case' && (colorStr === '#d97706' || colorNameStr.includes('amber')) && (
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
          top: zone.top,
          left: zone.left,
          width: zone.width,
          height: zone.height,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          overflow: 'hidden',
          transition: 'all 0.15s ease-out',
        }}
      >
        {/* ── INDEPENDENT UPLOADED IMAGE / GRAPHIC LAYER ── */}
        {(designImage || uploadedFileName) && (
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
        )}

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