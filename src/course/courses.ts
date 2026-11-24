import { INTERLAGOS } from './interlagos';
import { KYOTO_OUTER } from './kyotoOuter';
import type { CourseDefinition } from './types';

/** 選べるコース（タイトルのメニューに出る順） */
export const COURSES: readonly CourseDefinition[] = [KYOTO_OUTER, INTERLAGOS];

export function courseById(id: string | null | undefined): CourseDefinition {
  return COURSES.find((c) => c.id === id) ?? KYOTO_OUTER;
}
