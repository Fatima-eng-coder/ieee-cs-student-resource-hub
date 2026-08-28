export interface CourseCreditParts {
  theoryHours: number;
  labHours: number;
  totalCreditHours: number;
}

export function formatCourseCredits(theoryHours = 0, labHours = 0): string {
  return `(${theoryHours},${labHours})`;
}

export function parseCourseCreditInput(value: string): { credits?: CourseCreditParts; error?: string } {
  const match = value.trim().match(/^\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/);

  if (!match) {
    return { error: 'Credit hours must use tuple format like (3,1).' };
  }

  const theoryHours = Number(match[1]);
  const labHours = Number(match[2]);

  if (!Number.isInteger(theoryHours) || !Number.isInteger(labHours)) {
    return { error: 'Theory and lab hours must be integers.' };
  }

  if (theoryHours < 0 || labHours < 0) {
    return { error: 'Theory and lab hours cannot be negative.' };
  }

  const totalCreditHours = theoryHours + labHours;
  if (totalCreditHours > 6) {
    return { error: 'Total credit hours must be from 0 to 6.' };
  }

  return {
    credits: {
      theoryHours,
      labHours,
      totalCreditHours,
    },
  };
}
