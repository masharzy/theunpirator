const DEFAULT_SORTS = new Set(["newest", "oldest"]);

function validationError(message, field, value) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.status = 400;
  error.details = {
    fieldErrors: field ? { [field]: [`Invalid value${value == null ? "" : `: ${value}`}`] } : {},
  };
  return error;
}

function positiveInteger(value, fallback, { field, min = 1, max = 1_000_000 } = {}) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw validationError(`Invalid ${field || "number"}`, field, value);
  }
  return parsed;
}

function dateValue(value, field) {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw validationError(`Invalid ${field}`, field, value);
  return parsed;
}

function firstPresent(primary, fallback) {
  return primary == null || primary === "" ? fallback : primary;
}

export function hasListQuery(input = {}) {
  return ["page", "limit", "pageSize", "search", "q", "status", "sort", "from", "to"].some(
    (key) => input[key] != null && input[key] !== "",
  );
}

export function parseListQuery(
  input = {},
  {
    defaultLimit = 25,
    maxLimit = 100,
    maxSearch = 160,
    sortValues = DEFAULT_SORTS,
    defaultSort = "newest",
  } = {},
) {
  const page = positiveInteger(input.page, 1, { field: "page", max: 1_000_000 });
  const limit = positiveInteger(firstPresent(input.limit, input.pageSize), defaultLimit, {
    field: "limit",
    max: maxLimit,
  });
  const search = String(firstPresent(input.search, input.q) || "").trim();
  if (search.length > maxSearch) {
    throw validationError(
      `Search must be ${maxSearch} characters or fewer`,
      "search",
      search.length,
    );
  }

  const allowedSorts = sortValues instanceof Set ? sortValues : new Set(sortValues);
  const sort = String(input.sort || defaultSort)
    .trim()
    .toLowerCase();
  if (!allowedSorts.has(sort)) throw validationError("Invalid sort", "sort", sort);

  const from = dateValue(input.from, "from");
  const to = dateValue(input.to, "to");
  if (from && to && from.getTime() > to.getTime()) {
    throw validationError("from must be before to", "from", input.from);
  }

  return { page, limit, search, sort, from, to };
}

export function paginationMeta({ page, limit, total }) {
  const safeTotal = Math.max(0, Number(total || 0));
  const totalPages = Math.max(1, Math.ceil(safeTotal / limit));
  const safePage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  return {
    page: safePage,
    limit,
    total: safeTotal,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrevious: safePage > 1,
  };
}
