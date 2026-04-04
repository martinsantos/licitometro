import React from 'react';

interface HunterButtonProps {
  onClick: () => void;
  loading?: boolean;
  matchCount?: number;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<string, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2.5',
};

const iconSizes: Record<string, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const CrosshairIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
  </svg>
);

const LoadingSpinner: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth={3}
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

const HunterButton: React.FC<HunterButtonProps> = ({
  onClick,
  loading = false,
  matchCount,
  size = 'md',
}) => {
  const hasMatches = typeof matchCount === 'number' && matchCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`
        relative inline-flex items-center font-semibold rounded-lg
        bg-gradient-to-r from-amber-500 to-orange-500
        hover:from-amber-600 hover:to-orange-600
        text-white shadow-md hover:shadow-lg
        transition-all duration-200
        disabled:opacity-60 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2
        ${sizeClasses[size]}
      `}
    >
      {loading ? (
        <LoadingSpinner className={iconSizes[size]} />
      ) : (
        <CrosshairIcon className={iconSizes[size]} />
      )}
      <span>HUNTER</span>

      {hasMatches && !loading && (
        <span
          className="
            absolute -top-2 -right-2
            inline-flex items-center justify-center
            min-w-[20px] h-5 px-1.5
            text-[11px] font-bold
            text-white bg-red-500
            rounded-full shadow-sm
            animate-pulse
          "
        >
          {matchCount}
        </span>
      )}
    </button>
  );
};

export default React.memo(HunterButton);
