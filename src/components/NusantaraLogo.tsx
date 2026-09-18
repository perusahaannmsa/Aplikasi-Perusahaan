import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  companyName?: string;
  logoUrl?: string;
}

export const NusantaraLogo: React.FC<LogoProps> = ({ 
  className = '', 
  size = 'md', 
  companyName,
  logoUrl: customLogoUrl 
}) => {
  const dimensions = {
    xs: 'h-8 w-auto max-w-[110px]',
    sm: 'h-12 w-auto max-w-[150px]',
    md: 'h-20 w-auto max-w-[240px]',
    lg: 'h-28 w-auto max-w-[320px]',
  };

  const dimClass = dimensions[size] || dimensions.md;

  // Default corporate company logo
  const defaultLogoUrl = 'https://i.ibb.co.com/TqgprgPT/Logo-Nusantara-Mineral-Abadi.webp';
  const effectiveLogoUrl = (customLogoUrl && customLogoUrl.trim() !== '') ? customLogoUrl.trim() : defaultLogoUrl;

  return (
    <div className={`flex items-center select-none ${className}`}>
      <img
        src={effectiveLogoUrl}
        alt={companyName || 'PT Nusantara Mineral Sukses Abadi'}
        className={`company-logo-img ${dimClass} object-contain`}
        referrerPolicy="no-referrer"
        onError={(e) => {
          // Graceful fallback if custom logo fails to load
          const target = e.currentTarget;
          if (target.src !== defaultLogoUrl) {
            target.src = defaultLogoUrl;
          }
        }}
      />
    </div>
  );
};

