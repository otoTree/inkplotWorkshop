import { createClient } from '@/lib/supabase/client';
import { Project, Episode, Asset, Shot } from '@/types';

const supabase = createClient();

type ArtStyleFields = Pick<Project, 'artStyle' | 'characterArtStyle' | 'sceneArtStyle'>;

const parseArtStyle = (value: unknown): ArtStyleFields => {
  if (!value) return {};
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return {
      artStyle: typeof record.artStyle === 'string' ? record.artStyle : undefined,
      characterArtStyle: typeof record.characterArtStyle === 'string' ? record.characterArtStyle : undefined,
      sceneArtStyle: typeof record.sceneArtStyle === 'string' ? record.sceneArtStyle : undefined,
    };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        return {
          artStyle: typeof record.artStyle === 'string' ? record.artStyle : undefined,
          characterArtStyle: typeof record.characterArtStyle === 'string' ? record.characterArtStyle : undefined,
          sceneArtStyle: typeof record.sceneArtStyle === 'string' ? record.sceneArtStyle : undefined,
        };
      }
    } catch {
      return { artStyle: trimmed };
    }
    return { artStyle: trimmed };
  }
  return {};
};

const serializeArtStyle = (input: Partial<Project>) => {
  const artStyle = (input.artStyle || '').trim();
  const characterArtStyle = (input.characterArtStyle || '').trim();
  const sceneArtStyle = (input.sceneArtStyle || '').trim();
  if (!artStyle && !characterArtStyle && !sceneArtStyle) return null;
  return JSON.stringify({
    artStyle: artStyle || undefined,
    characterArtStyle: characterArtStyle || undefined,
    sceneArtStyle: sceneArtStyle || undefined,
  });
};

const toProject = (row: Record<string, unknown>): Project => {
  const { artStyle, characterArtStyle, sceneArtStyle } = parseArtStyle(row.art_style);
  return {
    id: row.id as string,
    title: row.title as string,
    logline: (row.logline as string) || '',
    genre: (row.genre as string[]) || [],
    language: (row.language as string) || 'zh',
    artStyle,
    characterArtStyle,
    sceneArtStyle,
    seriesPlan: row.series_plan,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
};

const toEpisode = (row: Record<string, unknown>): Episode => ({
  id: row.id as string,
  projectId: row.project_id as string,
  episodeNumber: row.episode_number as number,
  title: row.title as string,
  content: (row.content as string) || '',
  structure: (row.structure as Episode['structure']) || {},
  lastEdited: new Date(row.last_edited as string).getTime(),
});

const toAsset = (row: Record<string, unknown>): Asset => ({
  id: row.id as string,
  projectId: row.project_id as string,
  type: row.type as Asset['type'],
  name: row.name as string,
  description: (row.description as string) || '',
  visualPrompt: (row.visual_prompt as string) || '',
  imageUrl: (row.image_url as string) || '',
  status: row.status as Asset['status'],
  metadata: (row.metadata as Asset['metadata']) || {},
});

const toShot = (row: Record<string, unknown>): Shot => ({
  id: row.id as string,
  episodeId: row.episode_id as string,
  sequence: row.sequence_number as number,
  narrativeGoal: (row.narrative_goal as string) || '',
  visualEvidence: (row.visual_evidence as string) || '',
  description: (row.description as string) || '',
  dialogue: (row.dialogue as string) || '',
  camera: (row.camera as string) || '',
  size: (row.size as string) || '',
  duration: row.duration as number,
  relatedAssetIds: (row.related_asset_ids as string[]) || [],
});

export const api = {
  // Projects
  projects: {
    list: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data.map(toProject);
    },
    
    get: async (id: string): Promise<Project | null> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) return null;
      return toProject(data);
    },

    create: async (project: Project): Promise<void> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.from('projects').insert({
        id: project.id,
        user_id: user.id,
        title: project.title,
        logline: project.logline,
        genre: project.genre,
        language: project.language || 'zh',
        art_style: serializeArtStyle(project),
        series_plan: project.seriesPlan,
        created_at: new Date(project.createdAt).toISOString(),
        updated_at: new Date(project.updatedAt).toISOString(),
      });
      if (error) throw error;
    },

    update: async (id: string, updates: Partial<Project>): Promise<void> => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.title) dbUpdates.title = updates.title;
      if (updates.logline) dbUpdates.logline = updates.logline;
      if (updates.genre) dbUpdates.genre = updates.genre;
      if (updates.language !== undefined) dbUpdates.language = updates.language || 'zh';
      if ('artStyle' in updates || 'characterArtStyle' in updates || 'sceneArtStyle' in updates) {
        dbUpdates.art_style = serializeArtStyle(updates);
      }
      if (updates.seriesPlan) dbUpdates.series_plan = updates.seriesPlan;
      dbUpdates.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('projects')
        .update(dbUpdates)
        .eq('id', id);
      
      if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    }
  },

  // Episodes
  episodes: {
    list: async (projectId: string): Promise<Episode[]> => {
      const { data, error } = await supabase
        .from('episodes')
        .select('*')
        .eq('project_id', projectId)
        .order('episode_number', { ascending: true });
        
      if (error) throw error;
      return data.map(toEpisode);
    },

    create: async (episode: Episode): Promise<void> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.from('episodes').insert({
        id: episode.id,
        user_id: user.id,
        project_id: episode.projectId,
        episode_number: episode.episodeNumber,
        title: episode.title,
        content: episode.content,
        structure: episode.structure,
        last_edited: new Date(episode.lastEdited).toISOString(),
      });
      if (error) throw error;
    },
    
    bulkCreate: async (episodes: Episode[]): Promise<void> => {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) throw new Error('User not authenticated');
       
       const rows = episodes.map(e => ({
        id: e.id,
        user_id: user.id,
        project_id: e.projectId,
        episode_number: e.episodeNumber,
        title: e.title,
        content: e.content,
        structure: e.structure,
        last_edited: new Date(e.lastEdited).toISOString(),
       }));

       const { error } = await supabase.from('episodes').insert(rows);
       if (error) throw error;
    },

    update: async (id: string, updates: Partial<Episode>): Promise<void> => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.title) dbUpdates.title = updates.title;
      if (updates.content) dbUpdates.content = updates.content;
      if (updates.structure) dbUpdates.structure = updates.structure;
      dbUpdates.last_edited = new Date().toISOString();

      const { error } = await supabase
        .from('episodes')
        .update(dbUpdates)
        .eq('id', id);
        
      if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('episodes').delete().eq('id', id);
      if (error) throw error;
    },
    
    deleteByProject: async (projectId: string): Promise<void> => {
        const { error } = await supabase.from('episodes').delete().eq('project_id', projectId);
        if (error) throw error;
    }
  },

  // Assets
  assets: {
    list: async (projectId: string): Promise<Asset[]> => {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('project_id', projectId);
        
      if (error) throw error;
      return data.map(toAsset);
    },

    create: async (asset: Asset): Promise<void> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.from('assets').insert({
        id: asset.id,
        user_id: user.id,
        project_id: asset.projectId,
        type: asset.type,
        name: asset.name,
        description: asset.description,
        visual_prompt: asset.visualPrompt,
        image_url: asset.imageUrl,
        status: asset.status,
        metadata: asset.metadata,
      });
      if (error) throw error;
    },

    bulkCreate: async (assets: Asset[]): Promise<void> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      if (assets.length === 0) return;

      const rows = assets.map(asset => ({
        id: asset.id,
        user_id: user.id,
        project_id: asset.projectId,
        type: asset.type,
        name: asset.name,
        description: asset.description,
        visual_prompt: asset.visualPrompt,
        image_url: asset.imageUrl,
        status: asset.status,
        metadata: asset.metadata,
      }));

      const { error } = await supabase.from('assets').insert(rows);
      if (error) throw error;
    },

    update: async (id: string, updates: Partial<Asset>): Promise<void> => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.description) dbUpdates.description = updates.description;
      if (updates.visualPrompt) dbUpdates.visual_prompt = updates.visualPrompt;
      if (updates.imageUrl) dbUpdates.image_url = updates.imageUrl;
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.metadata) dbUpdates.metadata = updates.metadata;

      const { error } = await supabase
        .from('assets')
        .update(dbUpdates)
        .eq('id', id);
        
      if (error) throw error;
    },
    
    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('assets').delete().eq('id', id);
        if (error) throw error;
    },

    deleteByProject: async (projectId: string): Promise<void> => {
        const { error } = await supabase.from('assets').delete().eq('project_id', projectId);
        if (error) throw error;
    }
  },

  // Shots
  shots: {
    list: async (episodeId: string): Promise<Shot[]> => {
      const { data, error } = await supabase
        .from('shots')
        .select('*')
        .eq('episode_id', episodeId)
        .order('sequence_number', { ascending: true });
        
      if (error) throw error;
      return data.map(toShot);
    },

    create: async (shot: Shot): Promise<void> => {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) throw new Error('User not authenticated');
       
       const { error } = await supabase.from('shots').insert({
         id: shot.id,
         user_id: user.id,
         episode_id: shot.episodeId,
         sequence_number: shot.sequence,
         narrative_goal: shot.narrativeGoal,
         visual_evidence: shot.visualEvidence,
         description: shot.description,
         dialogue: shot.dialogue,
         camera: shot.camera,
         size: shot.size,
         duration: shot.duration,
         related_asset_ids: shot.relatedAssetIds
       });
       if (error) throw error;
    },
    
    bulkCreate: async (shots: Shot[]): Promise<void> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        
        const rows = shots.map(s => ({
            id: s.id,
            user_id: user.id,
            episode_id: s.episodeId,
            sequence_number: s.sequence,
            narrative_goal: s.narrativeGoal,
            visual_evidence: s.visualEvidence,
            description: s.description,
            dialogue: s.dialogue,
            camera: s.camera,
            size: s.size,
            duration: s.duration,
            related_asset_ids: s.relatedAssetIds
        }));
        
        const { error } = await supabase.from('shots').insert(rows);
        if (error) throw error;
    },

    update: async (id: string, updates: Partial<Shot>): Promise<void> => {
        const dbUpdates: Record<string, unknown> = {};
        if (updates.sequence !== undefined) dbUpdates.sequence_number = updates.sequence;
        if (updates.narrativeGoal !== undefined) dbUpdates.narrative_goal = updates.narrativeGoal;
        if (updates.visualEvidence !== undefined) dbUpdates.visual_evidence = updates.visualEvidence;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.dialogue !== undefined) dbUpdates.dialogue = updates.dialogue;
        if (updates.camera !== undefined) dbUpdates.camera = updates.camera;
        if (updates.size !== undefined) dbUpdates.size = updates.size;
        if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
        if (updates.relatedAssetIds !== undefined) dbUpdates.related_asset_ids = updates.relatedAssetIds;

        const { error } = await supabase.from('shots').update(dbUpdates).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('shots').delete().eq('id', id);
        if (error) throw error;
    },
    
    deleteByEpisode: async (episodeId: string): Promise<void> => {
        const { error } = await supabase.from('shots').delete().eq('episode_id', episodeId);
        if (error) throw error;
    }
  }
};
