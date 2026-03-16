// Types
export type { User, Repository, GitHubRepo, PublicRepository, Team, TeamMember, Project, InboxCount, InboxTask, MyIssueTask } from './types';

// Auth
export {
  fetchCurrentUser,
  createLocalSession,
  loginUser,
  registerUser,
  getLoginUrl,
  getGitHubConnectUrl,
  checkDesktopGitHubAuth,
  loginWithDesktopGitHubAuth,
  startGitHubDeviceLogin,
  pollGitHubDeviceLogin,
  logout,
} from './auth';
export type {
  DesktopGitHubCheckResponse,
  DesktopGitHubLoginResponse,
  GitHubDeviceStartResponse,
  GitHubDevicePollResponse,
  GitHubDevicePollPendingResponse,
  GitHubDevicePollSuccessResponse,
} from './auth';
export { isDesktopRuntime } from './client';

// Repos
export { fetchUserRepositories, fetchGitHubRepos, importRepo, activateRepository, getActiveRepository, setActiveRepositoryBaseBranch, addRepoByUrl, getActivePublicRepository, activatePublicRepository } from './repos';

// Teams
export { fetchTeams, fetchTeam, createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember, joinTeam } from './teams';

// Projects
export { fetchProjects, createProject, updateProject, deleteProject } from './projects';

// Tasks & Inbox
export { fetchMyIssues, executeTaskPublic, refreshTaskPr, fetchInboxTasks, fetchInboxCount, markInboxRead, markAllInboxRead } from './tasks';

// Metadata Queue
export { metadataQueue, listenToTaskMetadata } from './metadata-queue';
export type { ExecutionMetadataSync, QueuedMetadataEvent } from './metadata-queue';
