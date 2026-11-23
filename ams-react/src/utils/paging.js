// Helpers for lists paged on the server (list_page_request() / list_page_meta()
// in backend/config.php: ?page=&limit=, answered with total, page, limit, pages).

// The 1-based row numbers a page shows: page 2 of 25 per page over 30 rows is
// 26–30. An empty list is 0–0.
export function pageRange(page, limit, total) {
  if (!total || !limit) return { from: 0, to: 0 };
  const from = Math.min(total, (Math.max(1, page) - 1) * limit + 1);
  return { from, to: Math.min(total, from + limit - 1) };
}

// After a delete or a filter change the page asked for can lie past the end
// (page 4 of what is now 3): the last page that exists, never below 1.
export function clampPage(page, pages) {
  return Math.min(Math.max(1, page || 1), Math.max(1, pages || 1));
}

// The paging fields of a response, with safe defaults when an older server
// answered without them (then everything came back on one page).
export function readPageMeta(data, fallbackCount = 0) {
  const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : fallbackCount;
  const limit = Number(data?.limit) || Math.max(1, fallbackCount);
  return {
    total,
    page: Number(data?.page) || 1,
    limit,
    pages: Number(data?.pages) || 1,
  };
}
