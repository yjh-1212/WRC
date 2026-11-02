export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  portal: string;
  organizationId: string | null;
  enterpriseId: string | null;
  roles: Array<{ id: string; code: string; name: string }>;
  permissions: string[];
  workspaceId?: string | null;
  accountLevel?: string;
  authVersion?: number;
  scopeOrganizationIds?: string[];
  workspace?: {
    id: string; cityCode: string; cityName: string; status: string;
    modules: string[]; validUntil: Date | null; organizationId: string;
  } | null;
}
