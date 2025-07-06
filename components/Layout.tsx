
import React from 'react';
import { Activity } from 'lucide-react';

interface HeaderProps {
  title: string;
  className?: string; // Added className prop
}

export const Header: React.FC<HeaderProps> = ({ title, className }) => {
  return (
    <header className={`bg-neutral-darkest text-neutral-lightest shadow-lg border-b-2 border-primary-dark ${className || ''}`}> {/* Applied className */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex items-center"> {/* Increased py */}
        <Activity className="h-8 w-8 sm:h-9 sm:w-9 mr-3 sm:mr-4 text-primary-light" /> {/* Larger icon, lighter primary color */}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{title}</h1> {/* Larger font, tighter tracking for modern feel */}
      </div>
    </header>
  );
};
