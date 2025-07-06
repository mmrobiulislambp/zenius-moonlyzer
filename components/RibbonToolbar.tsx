import React from 'react';
import { RibbonGroupConfig, RibbonActionConfig, MainView } from '../types'; 
import { cn } from '../utils/cn'; 

interface RibbonButtonProps {
  action: RibbonActionConfig;
  onAction: (actionType: string, targetViewId?: string, actionId?: string) => void;
  activeMainTabView: string; 
  isActive: boolean;
}

const renderSizedIconWithColor = (icon: React.ReactNode, size: number, colorClassName: string) => {
  if (React.isValidElement(icon)) {
    // Check if the icon is a fragment
    if (icon.type === React.Fragment) {
      const fragmentProps = icon.props as React.FragmentProps; // Explicitly cast props
      return React.Children.map(fragmentProps.children, (child) => {
        if (React.isValidElement(child)) {
          // Assuming children of fragments are also icons that accept 'size'
          return React.cloneElement(child as React.ReactElement<{ size?: number; className?: string }>, { 
            size, 
            className: `${(child.props as any).className || ''} ${colorClassName}`.trim() 
          });
        }
        return child;
      });
    }
    // Single element icon
    const existingClassName = (icon.props as any).className || '';
    return React.cloneElement(icon as React.ReactElement<{ size?: number; className?: string }>, { 
      size, 
      className: `${existingClassName} ${colorClassName}`.trim() 
    });
  }
  return icon;
};


const RibbonButton: React.FC<RibbonButtonProps> = ({ action, onAction, activeMainTabView, isActive }) => {
  if (action.showOnTabs && !action.showOnTabs.includes(activeMainTabView as any)) {
    return null;
  }

  const handleClick = () => {
    if (action.disabled) return;
    if (action.actionType === 'navigateToView' && action.targetViewId) {
      onAction(action.actionType, action.targetViewId, action.id);
    } else if (action.actionType === 'customAction' && action.customActionId) {
      onAction(action.actionType, undefined, action.customActionId);
    } else {
        onAction(action.actionType, undefined, action.id);
    }
  };

  const iconSize = action.displayType === 'large' ? 28 : 18;
  
  // Determine colors based on isActive state
  const iconColorClass = isActive 
    ? 'text-white' 
    : (action.disabled ? 'text-neutral-DEFAULT' : 'group-hover:text-primary-dark'); // Default icon color is often handled by the SVG itself or a base class

  const textColorClass = isActive 
    ? 'text-white' 
    : (action.disabled ? 'text-neutral-DEFAULT' : 'text-textPrimary group-hover:text-primary-dark');

  return (
    <button
      onClick={handleClick}
      title={action.tooltip || action.label}
      disabled={action.disabled}
      className={cn(
        "flex items-center justify-center p-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors duration-150 group",
        action.disabled ? "opacity-50 cursor-not-allowed" : "hover:shadow-md",
        action.displayType === 'large' ? "flex-col w-24 h-24 text-center" : "space-x-2",
        isActive 
          ? 'bg-primary text-white shadow-md ring-1 ring-primary-dark/60' 
          : 'bg-neutral-lightest/60 hover:bg-primary-lighter/40 text-textSecondary hover:text-primary-dark border border-transparent hover:border-primary-light/30 shadow-sm'
      )}
      aria-label={action.label}
      aria-pressed={isActive}
    >
      {renderSizedIconWithColor(action.icon, iconSize, iconColorClass)}
      <span className={cn(
        "text-xs font-medium leading-tight",
        action.displayType === 'large' ? "mt-1.5 text-center block" : "text-left",
        textColorClass
      )}>
        {action.label}
      </span>
    </button>
  );
};


interface RibbonToolbarProps {
  activeMainTabView: string; 
  groups: RibbonGroupConfig[];
  onAction: (actionType: string, targetViewId?: string, actionId?: string) => void;
  activeContentView: MainView; // New prop for currently active content view
}

const RibbonToolbar: React.FC<RibbonToolbarProps> = ({ activeMainTabView, groups, onAction, activeContentView }) => {
  if (!groups || groups.length === 0) {
    return null;
  }

  return (
    <div className="flex-shrink-0 relative z-10 bg-neutral-lighter border-b border-neutral-light shadow-md overflow-x-auto scrollbar-thin mb-4">
      <div className="flex px-2 py-2 space-x-1">
        {groups.map((group, groupIndex) => (
          <div 
            key={group.id || groupIndex} 
            className={cn(
              "flex flex-col",
              groupIndex < groups.length - 1 ? "border-r border-neutral-light pr-2 mr-1" : "" 
            )}
          >
            <div className="flex items-start space-x-0.5">
                {group.actions.map((action) => (
                <RibbonButton 
                    key={action.id} 
                    action={action} 
                    onAction={onAction} 
                    activeMainTabView={activeMainTabView} 
                    isActive={action.targetViewId === activeContentView}
                />
                ))}
            </div>
            {group.name && (
              <div className="w-full text-center pt-1 text-[10px] font-medium select-none text-textSecondary">
                {group.name}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RibbonToolbar;