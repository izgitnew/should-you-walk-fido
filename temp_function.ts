// Function to get temperature-based card color
function getTemperatureColor(tempF: number) {
  if (tempF < 0) {
    return '#4A148C'; // Dark purple for below 0
  } else if (tempF <= 14) {
    return '#4A148C'; // Dark purple for 0
  } else if (tempF <= 24) {
    return '#1565C0'; // Dark blue for15
  } else if (tempF < 35) {
    return '#0c8800'; // Green for25
  } else if (tempF < 50) {
    return '#A1CEDC'; // Light blue for35
  } else if (tempF < 65) {
    return '#0c8800'; // Green for50
  } else if (tempF < 75) {
    return '#ffb300'; // Orange for65
  } else if (tempF < 85) {
    return '#ff7d00'; // Dark orange for75-84
  } else {
    return '#88211'; // Red for 85+
  }
} 