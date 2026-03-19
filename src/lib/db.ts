import Dexie, { type EntityTable } from 'dexie';
import { Project, Episode, Asset, Shot } from '@/types';

const db = new Dexie('InkplotDB') as Dexie & {
  projects: EntityTable<Project, 'id'>;
  episodes: EntityTable<Episode, 'id'>;
  assets: EntityTable<Asset, 'id'>;
  shots: EntityTable<Shot, 'id'>;
};

// Schema declaration:
db.version(2).stores({
  projects: 'id, title, createdAt, updatedAt', // Primary key and indexed props
  episodes: 'id, projectId, episodeNumber',
  assets: 'id, projectId, type, name',
  shots: 'id, episodeId, sequence'
}).upgrade(tx => {
  // Migration to v2: Add new industrial-grade fields to shots, handled automatically by Dexie.
});

export { db };
