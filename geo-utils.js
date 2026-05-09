/* ============================================
   GeoUtils — GPS/Coordinate math helpers
   ============================================ */

const GeoUtils = (() => {
  const EARTH_RADIUS_M = 6371000; // meters
  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;

  /**
   * Haversine distance between two GPS coords (in meters)
   */
  function distance(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * DEG_TO_RAD) *
        Math.cos(lat2 * DEG_TO_RAD) *
        Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Bearing from point 1 to point 2 (in degrees, 0=North, 90=East)
   */
  function bearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    const y = Math.sin(dLon) * Math.cos(lat2 * DEG_TO_RAD);
    const x =
      Math.cos(lat1 * DEG_TO_RAD) * Math.sin(lat2 * DEG_TO_RAD) -
      Math.sin(lat1 * DEG_TO_RAD) *
        Math.cos(lat2 * DEG_TO_RAD) *
        Math.cos(dLon);
    return ((Math.atan2(y, x) * RAD_TO_DEG) + 360) % 360;
  }

  /**
   * Generate a random point at given distance and bearing from origin
   */
  function pointAtDistanceBearing(lat, lon, distanceM, bearingDeg) {
    const angDist = distanceM / EARTH_RADIUS_M;
    const bearRad = bearingDeg * DEG_TO_RAD;
    const latRad = lat * DEG_TO_RAD;
    const lonRad = lon * DEG_TO_RAD;

    const newLat = Math.asin(
      Math.sin(latRad) * Math.cos(angDist) +
        Math.cos(latRad) * Math.sin(angDist) * Math.cos(bearRad)
    );
    const newLon =
      lonRad +
      Math.atan2(
        Math.sin(bearRad) * Math.sin(angDist) * Math.cos(latRad),
        Math.cos(angDist) - Math.sin(latRad) * Math.sin(newLat)
      );

    return {
      lat: newLat * RAD_TO_DEG,
      lon: newLon * RAD_TO_DEG,
    };
  }

  /**
   * Random point within min/max distance from origin
   */
  function randomPointAround(lat, lon, minDist, maxDist) {
    const dist = minDist + Math.random() * (maxDist - minDist);
    const bear = Math.random() * 360;
    return pointAtDistanceBearing(lat, lon, dist, bear);
  }

  /**
   * Move a coordinate toward a target at given speed (m/s) over dt (seconds)
   */
  function moveToward(fromLat, fromLon, toLat, toLon, speedMps, dt) {
    const dist = distance(fromLat, fromLon, toLat, toLon);
    const moveDist = speedMps * dt;

    if (moveDist >= dist) {
      return { lat: toLat, lon: toLon };
    }

    const bear = bearing(fromLat, fromLon, toLat, toLon);
    return pointAtDistanceBearing(fromLat, fromLon, moveDist, bear);
  }

  /**
   * Random patrol movement — pick a random direction and move
   */
  function randomWander(lat, lon, speedMps, dt) {
    const bear = Math.random() * 360;
    const dist = speedMps * dt;
    return pointAtDistanceBearing(lat, lon, dist, bear);
  }

  /**
   * Clamp latitude/longitude to valid ranges
   */
  function clamp(lat, lon) {
    return {
      lat: Math.max(-90, Math.min(90, lat)),
      lon: ((lon + 540) % 360) - 180,
    };
  }

  return {
    distance,
    bearing,
    pointAtDistanceBearing,
    randomPointAround,
    moveToward,
    randomWander,
    clamp,
    EARTH_RADIUS_M,
  };
})();
