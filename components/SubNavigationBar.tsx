
import React from 'react';
import { AppView, MainView } from '../types';

interface SubNavButtonProps {
  view: AppView;
  isActive: boolean;
  onClick: (viewId: MainView) => void;
}

const SubNavButton: React.FC<SubNavButtonProps> = ({ view, isActive, onClick }) => {
  const renderSizedIcon = () => {
    if (React.isValidElement(view.icon)) {
      // If the icon is a fragment, clone its children with the new size.
      // This handles cases like icon: <><Icon1 /><Icon2 /></>
      if (view.icon.type === React.Fragment) {
        const fragmentProps = view.icon.props as React.FragmentProps; // Explicitly cast props
        return React.Children.map(fragmentProps.children, (child) => {
          if (React.isValidElement(child)) {
            // Assuming children of fragments are also icons that accept 'size'
            return React.cloneElement(child as React.ReactElement<{ size?: number }>, { size: 26 });
          }
          return child;
        });
      }
      // If it's a single element (e.g., a Lucide icon), clone it directly.
      // The cast to React.ReactElement<{ size?: number }> helps TypeScript understand
      // that this element is expected to accept a size prop.
      return React.cloneElement(view.icon as React.ReactElement<{ size?: number }>, { size: 26 });
    }
    // Fallback for non-element icons (e.g., if a string or null was passed, though not expected here)
    return view.icon;
  };

  return (
    <button
      onClick={() => onClick(view.id)}
      title={view.title}
      className={`flex flex-col items-center justify-center p-2.5 rounded-lg w-24 h-24 sm:w-28 sm:h-28 text-center transition-all duration-150 ease-in-out group
                  ${isActive 
                    ? 'bg-primary-lighter/70 text-primary-dark border border-primary-light shadow-md ring-1 ring-primary-dark/50' 
                    : 'bg-neutral-lightest/60 hover:bg-primary-lighter/40 text-textSecondary hover:text-primary-dark border border-transparent hover:border-primary-light/50 shadow-sm hover:shadow-md'}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <div className={`mb-1.5 transition-transform duration-150 ease-in-out group-hover:scale-110 ${isActive ? 'text-primary-dark' : 'text-neutral-DEFAULT group-hover:text-primary'}`}>
        {renderSizedIcon()}
      </div>
      <span className={`text-[10px] sm:text-xs font-medium leading-tight line-clamp-2 ${isActive ? 'text-primary-dark' : 'text-textSecondary group-hover:text-primary-dark'}`}>
        {view.title}
      </span>
    </button>
  );
};


interface SubNavigationBarProps {
  views: AppView[];
  activeSubView: MainView | null; // The view that should be considered active for content rendering
  onSelectSubView: (viewId: MainView) => void;
}

const SubNavigationBar: React.FC<SubNavigationBarProps> = ({ views, activeSubView, onSelectSubView }) => {
  if (!views || views.length === 0) {
    return null; // Don't render if no sub-views
  }

  return (
    <nav className="flex flex-wrap gap-2 sm:gap-3 justify-start" aria-label="Sub Navigation">
      {views.map(view => (
        <SubNavButton
          key={view.id}
          view={view}
          isActive={activeSubView === view.id}
          onClick={onSelectSubView}
        />
      ))}
    </nav>
  );
};

export default SubNavigationBar;
