export type MergeableProfile = {
  id: string;
  fullName: string;
  email: string | null;
  organisationName: string | null;
  occupation: string | null;
  canDelete: boolean;
};
