// Expose stable, non-sensitive database error categories to API clients.
export function databaseFailureReason(error) {
  if (error?.code === '42501') return 'DATABASE_PERMISSION_DENIED';
  if (error?.code === '42P01' || error?.code === 'PGRST205') return 'DATABASE_TABLE_MISSING';
  if (error?.code === '42703' || error?.code === 'PGRST204') return 'DATABASE_COLUMN_MISSING';
  if (error?.code === '23514') return 'DATABASE_CONSTRAINT_FAILED';
  if (error?.code === 'PGRST301') return 'DATABASE_API_KEY_REJECTED';
  return 'DATABASE_OPERATION_FAILED';
}
