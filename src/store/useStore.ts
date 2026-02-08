import { create } from 'zustand';
import { Project, Episode } from '@/types';

interface AppState {
  currentProject: Project | null;
  currentEpisode: Episode | null;
  
  setCurrentProject: (project: Project | null) => void;
  setCurrentEpisode: (episode: Episode | null) => void;
}

export const useStore = create<AppState>((set) => ({
  currentProject: null,
  currentEpisode: null,
  
  setCurrentProject: (project) => set({ currentProject: project }),
  setCurrentEpisode: (episode) => set({ currentEpisode: episode }),
}));
