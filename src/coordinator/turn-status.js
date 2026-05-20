function decideTurnStatus(successCount, errorCount) {
  successCount = Number(successCount || 0);
  errorCount = Number(errorCount || 0);

  if (errorCount > 0 && successCount > 0) return 'partial';
  if (errorCount > 0) return 'error';
  return 'done';
}

module.exports = {
  decideTurnStatus
};
