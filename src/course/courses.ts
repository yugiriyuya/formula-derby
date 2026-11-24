import { BAKU, INTERLAGOS, MEXICO, MONACO, SPA } from './circuits';
import { KAWASAKI, KYOTO_OUTER, MOONEE_VALLEY, NAKAYAMA, TOKYO } from './racecourses';
import type { CourseDefinition } from './types';

/**
 * 全 10 コース。この順がシリーズ戦の開催順（競馬場と F1 サーキットを交互に）。
 * タイトルのコース選択もこの順に並ぶ。
 */
export const COURSES: readonly CourseDefinition[] = [
  KYOTO_OUTER,
  INTERLAGOS,
  NAKAYAMA,
  MONACO,
  TOKYO,
  SPA,
  KAWASAKI,
  BAKU,
  MOONEE_VALLEY,
  MEXICO,
];

export function courseById(id: string | null | undefined): CourseDefinition {
  return COURSES.find((c) => c.id === id) ?? KYOTO_OUTER;
}
