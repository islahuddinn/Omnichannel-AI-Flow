'use client';

// flagcdn.com only supports these specific PNG widths
const VALID_WIDTHS = [20, 40, 80, 160, 320, 640, 1280, 2560];

function getNearestWidth(target) {
  return VALID_WIDTHS.find(w => w >= target) || VALID_WIDTHS[VALID_WIDTHS.length - 1];
}

/**
 * Renders a country flag as an image using flagcdn.com.
 * Works consistently on all platforms (Windows, macOS, Linux)
 * unlike Unicode Regional Indicator Symbol emojis which
 * don't render as flags on Windows.
 *
 * @param {string} countryCode - ISO 3166-1 alpha-2 code (e.g., 'US', 'PK', 'SK')
 * @param {number} size - Width in pixels (default: 20)
 * @param {string} className - Additional CSS classes
 */
export default function CountryFlag({ countryCode, size = 20, className = '' }) {
  if (!countryCode || countryCode.length !== 2) return null;

  const code = countryCode.toLowerCase();
  const w1x = getNearestWidth(size);
  const w2x = getNearestWidth(size * 2);

  return (
    <img
      src={`https://flagcdn.com/w${w1x}/${code}.png`}
      srcSet={`https://flagcdn.com/w${w2x}/${code}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt=""
      className={`inline-block object-cover rounded-sm ${className}`}
      loading="lazy"
      style={{ verticalAlign: 'middle' }}
    />
  );
}
