export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  portal: string;
  organizationId: string | null;
  enterpriseId: string | null;
  roles: Array<{ id: string; code: string; name: string }>;
  permissions: string[];
}
