export function formatApiError(err: unknown): string {
  if (err && typeof err === 'object') {
    const GaxiosLike = err as {
      response?: { data?: { error?: { message?: string; status?: string } } };
      message?: string;
    };
    const apiMsg = GaxiosLike.response?.data?.error?.message;
    if (apiMsg) return apiMsg;
    if (GaxiosLike.message) return GaxiosLike.message;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
