/** One day/source cell of the Hires Trend by Source chart's underlying data. */
export type HiresTrendDayRow = {
  /** `YYYY-MM-DD`, the applications' created date. */
  day: string;
  sourceChannel: string;
  hires: number;
};
