// Estimate asphalt temperature based on air temperature (Fahrenheit)
// Asphalt can be 50°F-70°F hotter than air temp (source: Rover.com)
export function estimateAsphaltTempF(airTempF: number) {
  // Use a conservative average of +60°F
  return airTempF + 60;
}

// Get recommended max walk time (minutes) based on air temperature (Fahrenheit)
// Returns { riskLevel: string, maxMinutes: number | null }
export function getWalkSafety(airTempF: number) {
  if (airTempF < 75) {
    return { riskLevel: 'Low', maxMinutes: null };
  } else if (airTempF < 80) {
    return { riskLevel: 'Low to Moderate', maxMinutes: 30 };
  } else if (airTempF < 85) {
    return { riskLevel: 'Moderate', maxMinutes: 20 };
  } else if (airTempF < 90) {
    return { riskLevel: 'Moderate to High', maxMinutes: 15 };
  } else if (airTempF < 100) {
    return { riskLevel: 'High', maxMinutes: 5 };
  } else {
    return { riskLevel: 'Extremely High', maxMinutes: 0 };
  }
}

// Is it too hot for paws? Asphalt above 125°F is unsafe
export function isAsphaltTooHot(asphaltTempF: number) {
  return asphaltTempF >= 125;
} 