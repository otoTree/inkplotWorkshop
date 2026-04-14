'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PROJECT_VISUAL_STYLE_PRESET_DESCRIPTIONS,
  PROJECT_VISUAL_STYLE_PRESET_LABELS,
  PROJECT_VISUAL_STYLE_PRESET_OPTIONS,
} from '@/lib/project-visual-style';
import { ProjectVisualStylePreset } from '@/types';

interface ProjectVisualStylePresetSelectorProps {
  value: ProjectVisualStylePreset;
  onChange?: (value: ProjectVisualStylePreset) => void;
  helperText?: string;
  compatibilityHint?: string;
  className?: string;
}

export function ProjectVisualStylePresetSelector({
  value,
  onChange,
  helperText,
  compatibilityHint,
  className,
}: ProjectVisualStylePresetSelectorProps) {
  const isReadonly = !onChange;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-3">
        {PROJECT_VISUAL_STYLE_PRESET_OPTIONS.map((option) => {
          const isSelected = option.value === value;

          if (isReadonly) {
            return (
              <div
                key={option.value}
                className={cn(
                  'rounded-2xl border p-4 transition-colors',
                  isSelected
                    ? 'border-black/20 bg-black text-white shadow-sm'
                    : 'border-black/[0.08] bg-stone-50/60 text-black'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className={cn('text-sm font-medium', isSelected ? 'text-white' : 'text-black/85')}>
                      {PROJECT_VISUAL_STYLE_PRESET_LABELS[option.value]}
                    </div>
                    <p className={cn('text-xs leading-5', isSelected ? 'text-white/70' : 'text-black/55')}>
                      {PROJECT_VISUAL_STYLE_PRESET_DESCRIPTIONS[option.value]}
                    </p>
                  </div>
                  {isSelected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />}
                </div>
              </div>
            );
          }

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={isSelected}
              className={cn(
                'cursor-pointer rounded-2xl border p-4 text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15',
                isSelected
                  ? 'border-black bg-black text-white shadow-sm'
                  : 'border-black/[0.08] bg-stone-50/60 text-black hover:border-black/20 hover:bg-white'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className={cn('text-sm font-medium', isSelected ? 'text-white' : 'text-black/85')}>
                    {PROJECT_VISUAL_STYLE_PRESET_LABELS[option.value]}
                  </div>
                  <p className={cn('text-xs leading-5', isSelected ? 'text-white/70' : 'text-black/55')}>
                    {PROJECT_VISUAL_STYLE_PRESET_DESCRIPTIONS[option.value]}
                  </p>
                </div>
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    isSelected ? 'border-white/30 bg-white/10' : 'border-black/12 bg-white'
                  )}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {helperText && <p className="text-xs leading-5 text-black/50">{helperText}</p>}
      {compatibilityHint && (
        <div className="rounded-xl border border-black/[0.08] bg-stone-50 px-3 py-2 text-xs leading-5 text-black/60">
          {compatibilityHint}
        </div>
      )}
    </div>
  );
}
