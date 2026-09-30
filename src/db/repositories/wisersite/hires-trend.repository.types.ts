/** Raw shape of one row from the monthly hires-by-source query, before mapping. */
export type HiresTrendRawRow = {
  /** `pg`'s default type parser returns a `date` column as a `Date`, not a string. */
  month: Date | string;
  source_channel: string;
  hires: number;
};

/** One month/source cell from the Hires Trend by Source chart's underlying data. */
export type HiresTrendRow = {
  /** `YYYY-MM-01` — matches the app's `coerceMonth`. */
  month: string;
  sourceChannel: string;
  hires: number;
};
