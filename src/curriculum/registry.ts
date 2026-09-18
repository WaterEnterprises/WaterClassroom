// Lesson rendering is runtime (JSON from the view endpoint + LessonPlayer) —
// no generated components. Kept as a module so legacy imports keep resolving.
export interface GeneratedClass {
  component: any;
  title: string;
  subject: string;
  gradeLevel: string;
}

export const GENERATED_CLASSES: Record<string, GeneratedClass> = {};
