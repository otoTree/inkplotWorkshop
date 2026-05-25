import { createClient } from '@/lib/supabase/client';
import { Project, Episode, Asset, Shot } from '@/types';
import {
  parseProjectVisualStyle,
  resolveProjectVisualStyleSelection,
  serializeProjectVisualStyle,
} from '@/lib/project-visual-style';
import { normalizeShotDurationSeconds } from '@/lib/duration';
import { normalizeProjectVideoSettings } from '@/lib/volcengine/video-compat';
import { normalizeImageGenerationModel } from '@/lib/image-generation-models';
import { appendNoSubtitleDirective } from '@/lib/storyboard-generation';

const supabase = createClient();

const toProject = (row: Record<string, unknown>): Project => {
  const resolvedStyle = resolveProjectVisualStyleSelection(row.art_style);
  const normalizedVideoSettings = normalizeProjectVideoSettings(
    row.volcengine_video_settings as Project['volcengineVideoSettings'] | undefined
  );
  return {
    id: row.id as string,
    title: row.title as string,
    logline: (row.logline as string) || '',
    genre: (row.genre as string[]) || [],
    language: (row.language as string) || 'zh',
    imageGenerationModel: normalizeImageGenerationModel(row.image_generation_model),
    visualStylePreset: resolvedStyle.visualStylePreset,
    visualStylePresetSource: resolvedStyle.source,
    artStyle: resolvedStyle.artStyle,
    characterArtStyle: resolvedStyle.characterArtStyle,
    sceneArtStyle: resolvedStyle.sceneArtStyle,
    sensitivityPrompt: (row.sensitivity_prompt as string) || '',
    seriesPlan: row.series_plan,
    coverImageUrl: row.cover_image_url as string | undefined,
    coverImageCandidates: row.cover_image_candidates as string[] | undefined,
    coverTitle: row.cover_title as string | undefined,
    coverSlogan: row.cover_slogan as string | undefined,
    coverPrompt: row.cover_prompt as string | undefined,
    volcengineVideoSettings: normalizedVideoSettings,
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
  isMain: row.is_main as boolean | undefined,
  volcengineAssetId: row.volcengine_asset_id as string | undefined,
  volcengineAssetStatus: row.volcengine_asset_status as Asset['volcengineAssetStatus'],
  volcengineAssetGroupId: row.volcengine_asset_group_id as string | undefined,
  volcengineAssetProjectName: row.volcengine_asset_project_name as string | undefined,
  volcengineAssetType: row.volcengine_asset_type as Asset['volcengineAssetType'],
  volcengineAssetError: row.volcengine_asset_error as Asset['volcengineAssetError'],
  volcengineAssetSyncedAt: row.volcengine_asset_synced_at as string | undefined,
});

const toShot = (row: Record<string, unknown>): Shot => ({
  id: row.id as string,
  episodeId: row.episode_id as string,
  sequence: row.sequence_number as number,
  description: (row.description as string) || '',
  dialogue: (row.dialogue as string) || '',
  camera: (row.camera as string) || '',
  size: (row.size as string) || '',
  duration: normalizeShotDurationSeconds(row.duration),
  sensitivityReduction: (row.sensitivity_reduction as number) || 0,
  relatedAssetIds: (row.related_asset_ids as string[]) || [],
  sceneLabel: row.scene_label ? String(row.scene_label) : undefined,
  characterAction: row.character_action ? String(row.character_action) : undefined,
  emotion: row.emotion ? String(row.emotion) : undefined,
  lightingAtmosphere: row.lighting_atmosphere ? String(row.lighting_atmosphere) : undefined,
  soundEffect: row.sound_effect ? String(row.sound_effect) : undefined,
  referenceImage: row.reference_image ? String(row.reference_image) : undefined,
  videoPrompt: row.video_prompt ? String(row.video_prompt) : undefined,
  videoUrl: row.video_url ? String(row.video_url) : undefined,
  videoGenerationId: row.video_generation_id ? String(row.video_generation_id) : undefined,
  videoStatus: row.video_status ? (row.video_status as Shot['videoStatus']) : undefined,
  videoGenerationMetadata: row.video_generation_metadata
    ? (row.video_generation_metadata as Shot['videoGenerationMetadata'])
    : {},
  characters: row.characters as Shot['characters'] | undefined,
});

const normalizeShotVideoGenerationMetadata = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined
) => metadata ?? {};

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
        image_generation_model: project.imageGenerationModel,
        art_style: serializeProjectVisualStyle(project),
        sensitivity_prompt: project.sensitivityPrompt || '',
        series_plan: project.seriesPlan,
        volcengine_video_settings: project.volcengineVideoSettings || {},
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
      if (updates.imageGenerationModel !== undefined) {
        dbUpdates.image_generation_model = updates.imageGenerationModel;
      }
      if ('visualStylePreset' in updates || 'artStyle' in updates || 'characterArtStyle' in updates || 'sceneArtStyle' in updates) {
        const { data: existingStyleRow, error: existingStyleError } = await supabase
          .from('projects')
          .select('art_style')
          .eq('id', id)
          .single();

        if (existingStyleError && existingStyleError.code !== 'PGRST116') {
          throw existingStyleError;
        }

        const mergedStyle = {
          ...parseProjectVisualStyle(existingStyleRow?.art_style),
          ...updates,
        };
        dbUpdates.art_style = serializeProjectVisualStyle(mergedStyle);
      }
      if (updates.sensitivityPrompt !== undefined) dbUpdates.sensitivity_prompt = updates.sensitivityPrompt;
      if (updates.seriesPlan) dbUpdates.series_plan = updates.seriesPlan;
      if (updates.coverImageUrl !== undefined) dbUpdates.cover_image_url = updates.coverImageUrl;
      if (updates.coverImageCandidates !== undefined) dbUpdates.cover_image_candidates = updates.coverImageCandidates;
      if (updates.coverTitle !== undefined) dbUpdates.cover_title = updates.coverTitle;
      if (updates.coverSlogan !== undefined) dbUpdates.cover_slogan = updates.coverSlogan;
      if (updates.coverPrompt !== undefined) dbUpdates.cover_prompt = updates.coverPrompt;
      if (updates.volcengineVideoSettings !== undefined) dbUpdates.volcengine_video_settings = updates.volcengineVideoSettings || {};
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
        is_main: asset.isMain,
        volcengine_asset_id: asset.volcengineAssetId,
        volcengine_asset_status: asset.volcengineAssetStatus,
        volcengine_asset_group_id: asset.volcengineAssetGroupId,
        volcengine_asset_project_name: asset.volcengineAssetProjectName,
        volcengine_asset_type: asset.volcengineAssetType,
        volcengine_asset_error: asset.volcengineAssetError,
        volcengine_asset_synced_at: asset.volcengineAssetSyncedAt,
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
        is_main: asset.isMain,
        volcengine_asset_id: asset.volcengineAssetId,
        volcengine_asset_status: asset.volcengineAssetStatus,
        volcengine_asset_group_id: asset.volcengineAssetGroupId,
        volcengine_asset_project_name: asset.volcengineAssetProjectName,
        volcengine_asset_type: asset.volcengineAssetType,
        volcengine_asset_error: asset.volcengineAssetError,
        volcengine_asset_synced_at: asset.volcengineAssetSyncedAt,
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
      if (updates.isMain !== undefined) dbUpdates.is_main = updates.isMain;
      if (updates.volcengineAssetId !== undefined) dbUpdates.volcengine_asset_id = updates.volcengineAssetId;
      if (updates.volcengineAssetStatus !== undefined) dbUpdates.volcengine_asset_status = updates.volcengineAssetStatus;
      if (updates.volcengineAssetGroupId !== undefined) dbUpdates.volcengine_asset_group_id = updates.volcengineAssetGroupId;
      if (updates.volcengineAssetProjectName !== undefined) dbUpdates.volcengine_asset_project_name = updates.volcengineAssetProjectName;
      if (updates.volcengineAssetType !== undefined) dbUpdates.volcengine_asset_type = updates.volcengineAssetType;
      if (updates.volcengineAssetError !== undefined) dbUpdates.volcengine_asset_error = updates.volcengineAssetError;
      if (updates.volcengineAssetSyncedAt !== undefined) dbUpdates.volcengine_asset_synced_at = updates.volcengineAssetSyncedAt;

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
         description: shot.description,
         dialogue: shot.dialogue,
         camera: shot.camera,
         size: shot.size,
         duration: normalizeShotDurationSeconds(shot.duration),
         sensitivity_reduction: shot.sensitivityReduction,
         related_asset_ids: shot.relatedAssetIds,
         scene_label: shot.sceneLabel,
         character_action: shot.characterAction,
         emotion: shot.emotion,
         lighting_atmosphere: shot.lightingAtmosphere,
         sound_effect: shot.soundEffect,
         reference_image: shot.referenceImage,
         video_prompt: shot.videoPrompt ? appendNoSubtitleDirective(shot.videoPrompt) : shot.videoPrompt,
         video_url: shot.videoUrl,
         video_generation_id: shot.videoGenerationId,
         video_status: shot.videoStatus,
         video_generation_metadata: normalizeShotVideoGenerationMetadata(shot.videoGenerationMetadata),
         characters: shot.characters
       });
       if (error) throw error;
    },
    
    bulkCreate: async (shots: Shot[]): Promise<void> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        if (shots.length === 0) return;
        
        const rows = shots.map(s => ({
            id: s.id,
            user_id: user.id,
            episode_id: s.episodeId,
            sequence_number: s.sequence,
            description: s.description,
            dialogue: s.dialogue,
            camera: s.camera,
            size: s.size,
            duration: normalizeShotDurationSeconds(s.duration),
            sensitivity_reduction: s.sensitivityReduction,
            related_asset_ids: s.relatedAssetIds,
            scene_label: s.sceneLabel,
            character_action: s.characterAction,
            emotion: s.emotion,
            lighting_atmosphere: s.lightingAtmosphere,
            sound_effect: s.soundEffect,
            reference_image: s.referenceImage,
            video_prompt: s.videoPrompt ? appendNoSubtitleDirective(s.videoPrompt) : s.videoPrompt,
            video_url: s.videoUrl,
            video_generation_id: s.videoGenerationId,
            video_status: s.videoStatus,
            video_generation_metadata: normalizeShotVideoGenerationMetadata(s.videoGenerationMetadata),
            characters: s.characters
        }));
        
        const { error } = await supabase.from('shots').insert(rows);
        if (error) throw error;
    },

    update: async (id: string, updates: Partial<Shot>): Promise<void> => {
        const dbUpdates: Record<string, unknown> = {};
        if (updates.sequence !== undefined) dbUpdates.sequence_number = updates.sequence;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.dialogue !== undefined) dbUpdates.dialogue = updates.dialogue;
        if (updates.camera !== undefined) dbUpdates.camera = updates.camera;
        if (updates.size !== undefined) dbUpdates.size = updates.size;
        if (updates.duration !== undefined) dbUpdates.duration = normalizeShotDurationSeconds(updates.duration);
        if (updates.sensitivityReduction !== undefined) dbUpdates.sensitivity_reduction = updates.sensitivityReduction;
        if (updates.relatedAssetIds !== undefined) dbUpdates.related_asset_ids = updates.relatedAssetIds;
        if (updates.sceneLabel !== undefined) dbUpdates.scene_label = updates.sceneLabel;
        if (updates.characterAction !== undefined) dbUpdates.character_action = updates.characterAction;
        if (updates.emotion !== undefined) dbUpdates.emotion = updates.emotion;
        if (updates.lightingAtmosphere !== undefined) dbUpdates.lighting_atmosphere = updates.lightingAtmosphere;
        if (updates.soundEffect !== undefined) dbUpdates.sound_effect = updates.soundEffect;
        if (updates.referenceImage !== undefined) dbUpdates.reference_image = updates.referenceImage;
        if (updates.videoPrompt !== undefined) {
          dbUpdates.video_prompt = updates.videoPrompt
            ? appendNoSubtitleDirective(updates.videoPrompt)
            : updates.videoPrompt;
        }
        if (updates.videoUrl !== undefined) dbUpdates.video_url = updates.videoUrl;
        if (updates.videoGenerationId !== undefined) dbUpdates.video_generation_id = updates.videoGenerationId;
        if (updates.videoStatus !== undefined) dbUpdates.video_status = updates.videoStatus;
        if (updates.videoGenerationMetadata !== undefined) {
          dbUpdates.video_generation_metadata = normalizeShotVideoGenerationMetadata(
            updates.videoGenerationMetadata
          );
        }
        if (updates.characters !== undefined) dbUpdates.characters = updates.characters;

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
