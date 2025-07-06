
import React, { ReactNode } from 'react';

interface TabProps {
  title: string;
  isActive: boolean;
  onClick: () => void;
  icon?: ReactNode;
}

export const Tab: React.FC<TabProps> = ({ title, isActive, onClick, icon }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-75 transition-colors duration-150 ease-in-out group whitespace-nowrap px-3 py-1.5 text-xs font-medium
                  ${isActive 
                    ? 'bg-primary text-white shadow-md ring-2 ring-primary-dark/75' 
                    : 'bg-neutral-lightest text-textSecondary border border-neutral-light hover:bg-primary-lighter hover:text-primary-dark hover:border-primary-light shadow-sm'}`} 
      aria-current={isActive ? 'page' : undefined}
    >
      {icon && <span className={`mr-1.5 h-4 w-4 ${isActive ? 'text-white' : 'text-textSecondary group-hover:text-primary-dark'}`}>{icon}</span>}
      {title}
    </button>
  );
};

interface TabsProps {
  children: ReactNode;
}

export const Tabs: React.FC<TabsProps> = ({ children }) => {
  return (
    <div className=""> 
      <nav className="flex flex-wrap gap-2 items-center" aria-label="Tabs">
        {children}
      </nav>
    </div>
  );
};
