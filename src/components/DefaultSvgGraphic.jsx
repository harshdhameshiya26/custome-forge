import PropTypes from 'prop-types';

export const STICKER_CATEGORIES = ['All', 'Festivals', 'Holidays', 'Celebration', 'Lifestyle'];

export const STICKER_CATALOG = [
  // International / Foreign Events & Cultural Festivals
  { name: 'Diwali Diya', label: 'Diwali', event: 'Diwali (Festival of Lights)', category: 'Festivals' },
  { name: 'Lunar Lantern', label: 'Lunar Year', event: 'Chinese / Lunar New Year', category: 'Festivals' },
  { name: 'Halloween Pumpkin', label: 'Halloween', event: 'Halloween Spooky Season', category: 'Holidays' },
  { name: 'St. Patrick Clover', label: 'Shamrock', event: "St. Patrick's Day (Ireland)", category: 'Festivals' },
  { name: 'Fiesta Sombrero', label: 'Sombrero', event: 'Cinco de Mayo / Fiesta', category: 'Festivals' },
  { name: 'Oktoberfest Mug', label: 'Oktoberfest', event: 'Oktoberfest (Germany)', category: 'Festivals' },
  { name: 'Ramadan Moon', label: 'Eid & Moon', event: 'Eid / Ramadan', category: 'Festivals' },
  { name: 'Carnival Mask', label: 'Mardi Gras', event: 'Carnival & Mardi Gras', category: 'Festivals' },
  { name: 'Sakura Blossom', label: 'Sakura', event: 'Cherry Blossom (Japan)', category: 'Festivals' },

  // Global Holidays & Seasons
  { name: 'Christmas Tree', label: 'Christmas', event: 'Christmas & Winter Holiday', category: 'Holidays' },
  { name: 'Santa Hat', label: 'Santa Hat', event: 'Christmas Season', category: 'Holidays' },
  { name: 'Easter Egg', label: 'Easter Egg', event: 'Easter & Spring', category: 'Holidays' },
  { name: 'Valentine Rose', label: 'Valentine', event: "Valentine's Day", category: 'Holidays' },
  { name: 'New Year Fireworks', label: 'New Year', event: 'New Year 2026', category: 'Holidays' },

  // Celebrations & Milestones
  { name: 'Birthday Cake', label: 'Birthday', event: 'Birthday Celebration', category: 'Celebration' },
  { name: 'Party Popper', label: 'Party Confetti', event: 'Celebration & Party', category: 'Celebration' },
  { name: 'Champion Trophy', label: 'Trophy Cup', event: 'Sports & Champion', category: 'Celebration' },
  { name: 'Neon Music', label: 'Concert Note', event: 'Music & Concert Festival', category: 'Celebration' },

  // Lifestyle & Pop
  { name: 'Pride Rainbow', label: 'Pride Rainbow', event: 'Pride & Diversity', category: 'Lifestyle' },
  { name: 'Tropical Flamingo', label: 'Summer Flamingo', event: 'Summer & Tropical Beach', category: 'Lifestyle' },
  { name: 'Mountain Adventure', label: 'Mountain', event: 'Outdoors & Camping', category: 'Lifestyle' },
  { name: 'Beach Sunset', label: 'Sunset Waves', event: 'Travel & Vacation', category: 'Lifestyle' },
  { name: 'Pet Lover', label: 'Pet Paw', event: 'Pets & Animals', category: 'Lifestyle' },
  { name: 'Made With Love', label: 'Love Heart', event: 'Romance & Love', category: 'Lifestyle' },
  { name: 'Your Brand', label: 'Minimal Crest', event: 'Branding & Crest', category: 'Lifestyle' },
  { name: 'Stay Wild', label: 'Wild Skull', event: 'Rock & Wild', category: 'Lifestyle' },
];

/** Inline SVG default graphic for event & festive graphic stickers in full vibrant colors */
export function DefaultSvgGraphic({ name, color = '#111827', size = 90 }) {
  const norm = (name || '').toLowerCase();
  const s = size;

  // 1. Diwali Diya (Festival of Lights)
  if (norm.includes('diwali') || norm.includes('diya')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="38" r="28" fill="#ffeb3b" opacity="0.35" />
        <path d="M60 10C60 10 44 30 44 46C44 55 51 60 60 60C69 60 76 55 76 46C76 30 60 10 60 10Z" fill="#ff1744" />
        <path d="M60 20C60 20 50 34 50 46C50 52 54 55 60 55C66 55 70 52 70 46C70 34 60 20 60 20Z" fill="#ffd600" />
        <circle cx="60" cy="46" r="4" fill="#ffffff" />
        <path d="M22 60C22 60 30 84 60 84C90 84 98 60 98 60C98 60 76 65 60 65C44 65 22 60 22 60Z" fill="#ff6d00" stroke="#e65100" strokeWidth="2.5" />
        <ellipse cx="60" cy="60" rx="38" ry="7" fill="#ffb74d" stroke="#e65100" strokeWidth="2" />
        <path d="M50 84H70L74 92H46L50 84Z" fill="#d84315" />
        <circle cx="34" cy="30" r="2.5" fill="#ffd600" />
        <circle cx="86" cy="30" r="2.5" fill="#ffd600" />
        <polygon points="60,2 62,7 67,9 62,11 60,16 58,11 53,9 58,7" fill="#ffea00" />
      </svg>
    );
  }

  // 2. Chinese / Lunar New Year Lantern
  if (norm.includes('lunar') || norm.includes('lantern') || norm.includes('chinese') || norm.includes('dragon')) {
    return (
      <svg width={s} height={s * 0.95} viewBox="0 0 120 115" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="60" y1="2" x2="60" y2="18" stroke="#ffd700" strokeWidth="3" />
        <ellipse cx="60" cy="18" rx="16" ry="5" fill="#ffb300" stroke="#ff6f00" strokeWidth="1.5" />
        <ellipse cx="60" cy="54" rx="36" ry="32" fill="#d32f2f" stroke="#b71c1c" strokeWidth="2" />
        <ellipse cx="60" cy="54" rx="22" ry="32" fill="none" stroke="#ffd700" strokeWidth="2" strokeDasharray="5 3" />
        <ellipse cx="60" cy="54" rx="9" ry="32" fill="none" stroke="#ffd700" strokeWidth="2" />
        <rect x="52" y="46" width="16" height="16" transform="rotate(45 60 54)" fill="#ffd700" stroke="#ff8f00" strokeWidth="1.5" />
        <circle cx="60" cy="54" r="3" fill="#d32f2f" />
        <ellipse cx="60" cy="86" rx="16" ry="5" fill="#ffb300" stroke="#ff6f00" strokeWidth="1.5" />
        <line x1="60" y1="91" x2="60" y2="112" stroke="#ffb300" strokeWidth="4" strokeLinecap="round" />
        <line x1="53" y1="91" x2="51" y2="108" stroke="#ffd54f" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="67" y1="91" x2="69" y2="108" stroke="#ffd54f" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  // 3. Halloween Pumpkin (Jack-o'-lantern)
  if (norm.includes('pumpkin') || norm.includes('halloween')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M57 24C57 16 63 10 70 8C68 12 65 18 64 24" stroke="#388e3c" strokeWidth="6" strokeLinecap="round" />
        <path d="M68 10C73 10 78 14 76 18" stroke="#81c784" strokeWidth="2" strokeLinecap="round" fill="none" />
        <ellipse cx="60" cy="60" rx="42" ry="34" fill="#ff6d00" stroke="#e65100" strokeWidth="2" />
        <ellipse cx="60" cy="60" rx="28" ry="34" fill="#ff7900" stroke="#e65100" strokeWidth="1.5" />
        <ellipse cx="60" cy="60" rx="14" ry="34" fill="#ff9100" />
        <polygon points="44,48 54,54 42,56" fill="#ffd600" stroke="#b26a00" strokeWidth="1" />
        <polygon points="76,48 66,54 78,56" fill="#ffd600" stroke="#b26a00" strokeWidth="1" />
        <polygon points="60,56 56,62 64,62" fill="#ffd600" />
        <path d="M38 68L46 75L53 70L60 76L67 70L74 75L82 68C82 68 76 82 60 82C44 82 38 68 38 68Z" fill="#ffd600" stroke="#b26a00" strokeWidth="1.5" />
      </svg>
    );
  }

  // 4. St. Patrick's Shamrock Clover
  if (norm.includes('clover') || norm.includes('patrick') || norm.includes('shamrock')) {
    return (
      <svg width={s} height={s * 0.9} viewBox="0 0 120 105" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M60 56C60 76 68 96 76 98C77 98 78 97 76 95C67 86 63 70 61 56" stroke="#1b5e20" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M60 50C54 36 38 32 46 20C54 8 60 26 60 30C60 26 66 8 74 20C82 32 66 36 60 50Z" fill="#00c853" stroke="#1b5e20" strokeWidth="1.5" />
        <path d="M60 50C74 44 78 28 90 36C102 44 84 50 80 50C84 50 102 56 90 64C78 72 74 56 60 50Z" fill="#00c853" stroke="#1b5e20" strokeWidth="1.5" />
        <path d="M60 50C54 64 38 68 46 80C54 92 60 74 60 70C60 74 66 92 74 80C82 68 66 64 60 50Z" fill="#00e676" stroke="#1b5e20" strokeWidth="1.5" />
        <path d="M60 50C46 44 42 28 30 36C18 44 36 50 40 50C36 50 18 56 30 64C42 72 46 56 60 50Z" fill="#00c853" stroke="#1b5e20" strokeWidth="1.5" />
        <circle cx="60" cy="50" r="4.5" fill="#ffd600" />
      </svg>
    );
  }

  // 5. Cinco de Mayo Mexican Sombrero
  if (norm.includes('sombrero') || norm.includes('fiesta') || norm.includes('cinco')) {
    return (
      <svg width={s} height={s * 0.75} viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M44 45C44 26 50 12 60 12C70 12 76 26 76 45Z" fill="#ffb300" stroke="#e65100" strokeWidth="2" />
        <path d="M44 40H76" stroke="#d50000" strokeWidth="4" />
        <path d="M46 32H74" stroke="#00c853" strokeWidth="3" />
        <ellipse cx="60" cy="52" rx="54" ry="16" fill="#ffa000" stroke="#e65100" strokeWidth="2.5" />
        <ellipse cx="60" cy="50" rx="54" ry="12" fill="#ffd54f" />
        <path d="M10 52C24 62 96 62 110 52" stroke="#d50000" strokeWidth="3" fill="none" />
        <circle cx="28" cy="56" r="2.5" fill="#00c853" />
        <circle cx="48" cy="58" r="2.5" fill="#00c853" />
        <circle cx="72" cy="58" r="2.5" fill="#00c853" />
        <circle cx="92" cy="56" r="2.5" fill="#00c853" />
      </svg>
    );
  }

  // 6. Oktoberfest Beer Mug
  if (norm.includes('oktoberfest') || norm.includes('beer')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M78 35H94C102 35 106 42 106 50C106 62 98 70 80 70" stroke="#e65100" strokeWidth="7" strokeLinecap="round" fill="none" />
        <rect x="26" y="28" width="56" height="58" rx="8" fill="#ffb300" stroke="#ff8f00" strokeWidth="2.5" />
        <rect x="34" y="34" width="8" height="46" rx="4" fill="#ffd54f" opacity="0.6" />
        <rect x="50" y="34" width="8" height="46" rx="4" fill="#ffd54f" opacity="0.6" />
        <rect x="66" y="34" width="8" height="46" rx="4" fill="#ffd54f" opacity="0.6" />
        {/* Foamy head */}
        <circle cx="28" cy="26" r="10" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1" />
        <circle cx="44" cy="20" r="13" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1" />
        <circle cx="62" cy="18" r="14" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1" />
        <circle cx="78" cy="24" r="11" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1" />
        <rect x="24" y="24" width="60" height="10" fill="#ffffff" />
      </svg>
    );
  }

  // 7. Ramadan / Eid Crescent Moon & Mosque Lantern
  if (norm.includes('ramadan') || norm.includes('eid') || norm.includes('crescent')) {
    return (
      <svg width={s} height={s * 0.9} viewBox="0 0 120 105" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M78 12C50 14 30 38 32 66C34 88 52 102 78 98C60 92 48 76 48 56C48 34 62 18 78 12Z" fill="#ffd600" stroke="#ff9100" strokeWidth="2" />
        <polygon points="76,32 80,41 90,42 82,49 85,58 76,52 67,58 70,49 62,42 72,41" fill="#ffab00" />
        <line x1="94" y1="50" x2="94" y2="64" stroke="#ffab00" strokeWidth="2" />
        <path d="M88 64H100L96 78H92L88 64Z" fill="#7c4dff" stroke="#651fff" strokeWidth="1.5" />
        <circle cx="94" cy="71" r="2.5" fill="#ffd600" />
      </svg>
    );
  }

  // 8. Carnival / Mardi Gras Mask
  if (norm.includes('mask') || norm.includes('carnival') || norm.includes('mardi')) {
    return (
      <svg width={s} height={s * 0.75} viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Feathers */}
        <path d="M60 30C52 12 50 0 60 0C70 0 68 12 60 30Z" fill="#ffd600" />
        <path d="M50 34C35 18 30 6 38 4C48 4 50 18 54 34Z" fill="#aa00ff" />
        <path d="M70 34C85 18 90 6 82 4C72 4 70 18 66 34Z" fill="#00c853" />
        {/* Mask Base */}
        <path d="M12 40C22 36 44 38 60 48C76 38 98 36 108 40C114 58 100 78 72 74C64 72 60 62 60 62C60 62 56 72 48 74C20 78 6 58 12 40Z" fill="#7b1fa2" stroke="#4a148c" strokeWidth="2" />
        {/* Eye cutouts */}
        <ellipse cx="36" cy="50" rx="14" ry="7" transform="rotate(-10 36 50)" fill="#ffd600" stroke="#ffab00" strokeWidth="2" />
        <ellipse cx="84" cy="50" rx="14" ry="7" transform="rotate(10 84 50)" fill="#ffd600" stroke="#ffab00" strokeWidth="2" />
        <circle cx="60" cy="52" r="4" fill="#00e676" />
      </svg>
    );
  }

  // 9. Japanese Cherry Blossom (Sakura)
  if (norm.includes('sakura') || norm.includes('blossom') || norm.includes('cherry')) {
    return (
      <svg width={s} height={s * 0.9} viewBox="0 0 120 105" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* 5 Pink Petals with notched tips */}
        {[0, 72, 144, 216, 288].map((deg, i) => (
          <path
            key={i}
            d="M60 52 C50 30 52 14 57 12 C60 14 63 14 66 12 C71 14 70 30 60 52 Z"
            fill="#ff80ab"
            stroke="#f50057"
            strokeWidth="1.2"
            transform={`rotate(${deg} 60 52)`}
          />
        ))}
        <circle cx="60" cy="52" r="9" fill="#ff4081" />
        <circle cx="60" cy="52" r="5" fill="#ffd600" />
      </svg>
    );
  }

  // 10. Valentine's Day Romantic Rose & Ribbon
  if (norm.includes('rose') || norm.includes('valentine')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M60 88 18 48C-4 24 26-4 50 17l10 11 10-11C94-4 124 24 102 48L60 88Z" fill="#ff1744" stroke="#d50000" strokeWidth="2" />
        <circle cx="60" cy="40" r="12" fill="#d50000" />
        <path d="M54 38C54 32 66 32 66 38C66 44 54 44 54 50" stroke="#ffcdd2" strokeWidth="2" strokeLinecap="round" />
        <circle cx="60" cy="52" r="2" fill="#ffffff" />
      </svg>
    );
  }

  // 11. Easter Decorated Egg
  if (norm.includes('easter') || norm.includes('egg')) {
    return (
      <svg width={s} height={s * 0.9} viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="60" cy="60" rx="36" ry="46" fill="#80deea" stroke="#00acc1" strokeWidth="2" />
        <path d="M26 50Q42 42 60 50Q78 58 94 50" stroke="#e91e63" strokeWidth="4" fill="none" />
        <path d="M24 64Q42 56 60 64Q78 72 96 64" stroke="#ffd600" strokeWidth="5" fill="none" />
        <path d="M28 78Q44 70 60 78Q76 86 92 78" stroke="#ff4081" strokeWidth="3" fill="none" />
        <circle cx="42" cy="34" r="5" fill="#ff4081" />
        <circle cx="60" cy="28" r="6" fill="#ffd600" />
        <circle cx="78" cy="34" r="5" fill="#76ff03" />
      </svg>
    );
  }

  // 12. Christmas Holiday Tree
  if (norm.includes('christmas') || norm.includes('xmas') || norm.includes('tree')) {
    return (
      <svg width={s} height={s * 0.9} viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Star */}
        <polygon points="60,6 63,14 71,14 65,19 67,27 60,22 53,27 55,19 49,14 57,14" fill="#ffd600" />
        {/* Tree tiers */}
        <polygon points="60,20 78,44 42,44" fill="#00c853" stroke="#1b5e20" strokeWidth="1.5" />
        <polygon points="60,38 86,66 34,66" fill="#00b248" stroke="#1b5e20" strokeWidth="1.5" />
        <polygon points="60,58 96,92 24,92" fill="#009639" stroke="#1b5e20" strokeWidth="1.5" />
        {/* Trunk */}
        <rect x="53" y="92" width="14" height="14" fill="#795548" />
        {/* Ornaments */}
        <circle cx="56" cy="38" r="3" fill="#ff1744" />
        <circle cx="70" cy="54" r="3.5" fill="#ffd600" />
        <circle cx="46" cy="56" r="3.5" fill="#00e5ff" />
        <circle cx="62" cy="74" r="4" fill="#ff1744" />
        <circle cx="78" cy="82" r="3.5" fill="#ffd600" />
        <circle cx="40" cy="80" r="3.5" fill="#e040fb" />
      </svg>
    );
  }

  // 13. Santa Claus Hat
  if (norm.includes('santa') || norm.includes('hat')) {
    return (
      <svg width={s} height={s * 0.8} viewBox="0 0 120 95" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M25 65C30 35 60 14 96 26C104 28 102 38 94 38C80 38 72 48 68 65Z" fill="#d50000" stroke="#b71c1c" strokeWidth="2" />
        <rect x="18" y="62" width="76" height="16" rx="8" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
        <circle cx="102" cy="30" r="10" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      </svg>
    );
  }

  // 14. Party Confetti Popper
  if (norm.includes('party') || norm.includes('popper') || norm.includes('celebration')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,84 32,46 64,74" fill="#ffd600" stroke="#ffab00" strokeWidth="2" />
        <polygon points="20,84 28,58 48,76" fill="#ff6d00" />
        {/* Confetti ribbons & bursts */}
        <circle cx="62" cy="42" r="4" fill="#e91e63" />
        <circle cx="82" cy="32" r="5" fill="#00e5ff" />
        <circle cx="74" cy="56" r="3.5" fill="#76ff03" />
        <circle cx="94" cy="48" r="4" fill="#ffd600" />
        <circle cx="86" cy="68" r="4.5" fill="#d50000" />
        <rect x="52" y="24" width="7" height="7" transform="rotate(25 52 24)" fill="#00e676" />
        <rect x="96" y="26" width="6" height="9" transform="rotate(-30 96 26)" fill="#ff4081" />
        <path d="M60 30Q76 16 90 20T105 10" stroke="#ff1744" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>
    );
  }

  // 15. Birthday Cupcake & Candle
  if (norm.includes('birthday') || norm.includes('cake')) {
    return (
      <svg width={s} height={s * 0.9} viewBox="0 0 120 105" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Flame */}
        <path d="M60 8C60 8 54 18 54 24C54 28 57 30 60 30C63 30 66 28 66 24C66 18 60 8 60 8Z" fill="#ff6d00" />
        <circle cx="60" cy="24" r="3" fill="#ffd600" />
        {/* Candle */}
        <rect x="57" y="30" width="6" height="18" fill="#00e5ff" stroke="#00b0ff" strokeWidth="1" />
        {/* Frosting */}
        <path d="M26 62C26 44 40 44 48 46C54 42 66 42 72 46C80 44 94 44 94 62Z" fill="#ff4081" stroke="#c2185b" strokeWidth="2" />
        <circle cx="36" cy="54" r="2.5" fill="#ffffff" />
        <circle cx="60" cy="50" r="2.5" fill="#ffffff" />
        <circle cx="84" cy="54" r="2.5" fill="#ffffff" />
        {/* Cup base */}
        <path d="M30 62L38 94H82L90 62Z" fill="#ffd54f" stroke="#ffa000" strokeWidth="2" />
        <line x1="44" y1="64" x2="48" y2="92" stroke="#ffb300" strokeWidth="2" />
        <line x1="60" y1="64" x2="60" y2="92" stroke="#ffb300" strokeWidth="2" />
        <line x1="76" y1="64" x2="72" y2="92" stroke="#ffb300" strokeWidth="2" />
      </svg>
    );
  }

  // 16. Champion Trophy Cup
  if (norm.includes('trophy') || norm.includes('champion') || norm.includes('winner')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 24H20C15 24 12 36 22 46C30 52 38 48 38 48" stroke="#ffb300" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M88 24H100C105 24 108 36 98 46C90 52 82 48 82 48" stroke="#ffb300" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M30 18H90V46C90 64 74 72 60 72C46 72 30 64 30 46Z" fill="#ffd600" stroke="#ff8f00" strokeWidth="2.5" />
        <polygon points="60,26 63,35 72,35 65,40 67,49 60,44 53,49 55,40 48,35 57,35" fill="#ff6f00" />
        <rect x="54" y="72" width="12" height="12" fill="#ffa000" />
        <rect x="42" y="84" width="36" height="10" rx="3" fill="#5d4037" stroke="#3e2723" strokeWidth="1.5" />
      </svg>
    );
  }

  // 17. Neon Concert / Music Note
  if (norm.includes('music') || norm.includes('concert') || norm.includes('neon')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M42 66V22L86 14V58" stroke="#00e5ff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="42" y1="36" x2="86" y2="28" stroke="#e040fb" strokeWidth="5" />
        <ellipse cx="32" cy="68" rx="12" ry="8" transform="rotate(-15 32 68)" fill="#00e5ff" />
        <ellipse cx="76" cy="60" rx="12" ry="8" transform="rotate(-15 76 60)" fill="#e040fb" />
      </svg>
    );
  }

  // 18. Rainbow Pride Arc
  if (norm.includes('rainbow') || norm.includes('pride')) {
    return (
      <svg width={s} height={s * 0.65} viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 65A45 45 0 0 1 105 65" stroke="#ff1744" strokeWidth="6" fill="none" />
        <path d="M21 65A39 39 0 0 1 99 65" stroke="#ff9100" strokeWidth="6" fill="none" />
        <path d="M27 65A33 33 0 0 1 93 65" stroke="#ffd600" strokeWidth="6" fill="none" />
        <path d="M33 65A27 27 0 0 1 87 65" stroke="#00c853" strokeWidth="6" fill="none" />
        <path d="M39 65A21 21 0 0 1 81 65" stroke="#2979ff" strokeWidth="6" fill="none" />
        <path d="M45 65A15 15 0 0 1 75 65" stroke="#aa00ff" strokeWidth="6" fill="none" />
      </svg>
    );
  }

  // 19. Tropical Summer Flamingo
  if (norm.includes('flamingo') || norm.includes('tropical') || norm.includes('summer')) {
    return (
      <svg width={s} height={s * 0.9} viewBox="0 0 120 105" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Legs */}
        <line x1="60" y1="65" x2="60" y2="102" stroke="#ff4081" strokeWidth="3" strokeLinecap="round" />
        <path d="M60 74L74 86" stroke="#ff4081" strokeWidth="2.5" strokeLinecap="round" />
        {/* Body & Wing */}
        <ellipse cx="62" cy="54" rx="22" ry="15" fill="#ff4081" />
        <path d="M50 52C54 44 70 44 74 54C68 58 56 60 50 52Z" fill="#f50057" />
        {/* S-curved neck */}
        <path d="M76 52C82 46 88 34 84 22C82 14 74 14 74 20" stroke="#ff4081" strokeWidth="6" strokeLinecap="round" fill="none" />
        <circle cx="75" cy="18" r="7" fill="#ff4081" />
        <path d="M72 18L60 22" stroke="#212121" strokeWidth="4" strokeLinecap="round" />
        <circle cx="76" cy="16" r="1.5" fill="#ffffff" />
      </svg>
    );
  }

  // 20. New Year 2026 Sparkling Star
  if (norm.includes('2026') || norm.includes('star') || norm.includes('firework')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="60,6 74,36 106,38 80,60 88,92 60,74 32,92 40,60 14,38 46,36" fill="#ffd600" stroke="#ff9100" strokeWidth="2.5" />
        <polygon points="60,20 70,42 92,44 74,60 80,82 60,68 40,82 46,60 28,44 50,42" fill="#fff9c4" />
        <circle cx="20" cy="18" r="3" fill="#ff1744" />
        <circle cx="102" cy="20" r="3.5" fill="#00e5ff" />
        <circle cx="106" cy="78" r="3" fill="#76ff03" />
        <circle cx="14" cy="74" r="3" fill="#e040fb" />
      </svg>
    );
  }

  // 21. Mountain Outdoors
  if (norm.includes('mountain') || norm.includes('adventure')) {
    return (
      <svg width={s} height={s * 0.8} viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="70,12 115,82 25,82" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="2.5" />
        <polygon points="70,12 85,38 76,46 68,36 55,48" fill="#ffffff" />
        <polygon points="105,42 135,82 75,82" fill="#60a5fa" opacity="0.85" />
        <polygon points="35,46 65,82 5,82" fill="#1e40af" opacity="0.8" />
        <circle cx="70" cy="6" r="4" fill="#fbbf24" />
      </svg>
    );
  }

  // 22. Beach Sunset
  if (norm.includes('beach') || norm.includes('sunset')) {
    return (
      <svg width={s} height={s * 0.8} viewBox="0 0 130 95" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="65" cy="46" r="24" fill="#f59e0b" />
        <path d="M20 62Q65 48 110 62" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
        <path d="M25 72Q65 58 105 72" stroke="#06b6d4" strokeWidth="4" strokeLinecap="round" />
        <path d="M32 82Q65 72 98 82" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  }

  // 23. Boho Skull
  if (norm.includes('skull') || norm.includes('wild')) {
    return (
      <svg width={s} height={s * 0.85} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M60 14C40 14 28 28 28 48C28 62 36 72 44 76V88H76V76C84 72 92 62 92 48C92 28 80 14 60 14Z" fill="#f8fafc" stroke="#334155" strokeWidth="3" />
        <circle cx="46" cy="50" r="8" fill="#0f172a" />
        <circle cx="74" cy="50" r="8" fill="#0f172a" />
        <polygon points="60,60 56,68 64,68" fill="#334155" />
        <circle cx="34" cy="30" r="4" fill="#ec4899" />
        <circle cx="60" cy="24" r="5" fill="#8b5cf6" />
        <circle cx="86" cy="30" r="4" fill="#ec4899" />
      </svg>
    );
  }

  // 24. Pet Paw
  if (norm.includes('pet') || norm.includes('paw')) {
    return (
      <svg width={s} height={s * 0.8} viewBox="0 0 120 95" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="60" cy="62" rx="22" ry="18" fill="#f97316" />
        <ellipse cx="30" cy="38" rx="9" ry="13" transform="rotate(-25 30 38)" fill="#fb923c" />
        <ellipse cx="48" cy="24" rx="9" ry="13" transform="rotate(-10 48 24)" fill="#fb923c" />
        <ellipse cx="72" cy="24" rx="9" ry="13" transform="rotate(10 72 24)" fill="#fb923c" />
        <ellipse cx="90" cy="38" rx="9" ry="13" transform="rotate(25 90 38)" fill="#fb923c" />
      </svg>
    );
  }

  // 25. Romantic Heart
  if (norm.includes('love') || norm.includes('heart')) {
    return (
      <svg width={s} height={s * 0.8} viewBox="0 0 120 95" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M60 86 16 45C-6 22 26-6 50 15l10 11 10-11C94-6 126 22 104 45L60 86Z" fill="#ec4899" stroke="#be185d" strokeWidth="2.5" />
        <circle cx="44" cy="32" r="5" fill="#fdf2f8" opacity="0.6" />
      </svg>
    );
  }

  // 26. Geometric Branding Minimal Crest
  if (norm.includes('logo') || norm.includes('brand') || norm.includes('minimal')) {
    return (
      <svg width={s} height={s * 0.8} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="60,14 100,82 20,82" stroke="#6366f1" strokeWidth="5" strokeLinejoin="round" fill="#e0e7ff" />
        <polygon points="60,36 82,74 38,74" fill="#6366f1" />
        <circle cx="60" cy="14" r="6" fill="#ffd600" />
      </svg>
    );
  }

  // Default: Retro Golden Sun & Ocean Waves
  return (
    <svg width={s} height={s * 0.75} viewBox="0 0 150 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="75" cy="42" r="22" fill="#ffd600" stroke="#ff9800" strokeWidth="3" />
      <circle cx="75" cy="42" r="14" fill="#ff9800" />
      <line x1="75" y1="12" x2="75" y2="4" stroke="#ff9800" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="96" y1="21" x2="102" y2="15" stroke="#ff9800" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="105" y1="42" x2="113" y2="42" stroke="#ff9800" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="54" y1="21" x2="48" y2="15" stroke="#ff9800" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="45" y1="42" x2="37" y2="42" stroke="#ff9800" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M30 72C42 66 52 76 65 72C78 68 88 78 100 72" stroke="#00e5ff" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M36 82C46 78 56 86 68 82C80 78 90 86 102 82" stroke="#0288d1" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

DefaultSvgGraphic.propTypes = {
  name: PropTypes.string,
  color: PropTypes.string,
  size: PropTypes.number,
};

export default DefaultSvgGraphic;

