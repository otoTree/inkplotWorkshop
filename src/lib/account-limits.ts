export const ACCOUNT_LIMIT_EXEMPT_EMAIL = 'hjr0202@proton.me';

export interface AccountCreationLimits {
  exempt: boolean;
  maxProjects: number | null;
  maxEpisodesPerProject: number | null;
  maxShotsPerEpisode: number | null;
}

const UNLIMITED_ACCOUNT_LIMITS: AccountCreationLimits = {
  exempt: true,
  maxProjects: null,
  maxEpisodesPerProject: null,
  maxShotsPerEpisode: null,
};

const DEFAULT_ACCOUNT_LIMITS: AccountCreationLimits = {
  exempt: false,
  maxProjects: 1,
  maxEpisodesPerProject: 1,
  maxShotsPerEpisode: 10,
};

export const isAccountLimitExempt = (email?: string | null) =>
  email?.trim().toLowerCase() === ACCOUNT_LIMIT_EXEMPT_EMAIL;

export const getAccountCreationLimits = (email?: string | null): AccountCreationLimits =>
  isAccountLimitExempt(email)
    ? { ...UNLIMITED_ACCOUNT_LIMITS }
    : { ...DEFAULT_ACCOUNT_LIMITS };

const DATABASE_LIMIT_MESSAGES: Array<[string, string]> = [
  ['INKPLOT_LIMIT_PROJECTS', '当前账号最多只能创建 1 个项目。'],
  ['INKPLOT_LIMIT_EPISODES', '当前账号的每个项目最多只能创建 1 集。'],
  ['INKPLOT_LIMIT_SHOTS', '当前账号的每集最多只能创建 10 个分镜。'],
];

export const getAccountLimitErrorMessage = (
  error: unknown,
  fallback = '操作失败，请稍后重试。'
) => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : String(error || '');

  const matched = DATABASE_LIMIT_MESSAGES.find(([code]) => rawMessage.includes(code));
  return matched?.[1] || rawMessage || fallback;
};
