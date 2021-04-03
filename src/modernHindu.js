const { FEBRUARY } = require( './gregorian' )
const { fixedFromJulian } = require( './julian' )
const {
  MEAN_SIDEREAL_YEAR,
  dawn,
  dusk,
  localFromStandard,
  lunarPhase,
  newMoonAtOrAfter,
  newMoonBefore,
  siderealSolarLongitude,
  solarLongitude,
  universalFromStandard,
} = require( './astronomy' )
const { amod, angle, binarySearch, hr, invertAngular, mod, mod3, next, sinDegrees } = require( './general' )

// Fixed date of start of the Hindu calendar (Kali Yuga).
const HINDU_EPOCH = fixedFromJulian( -3102, FEBRUARY, 18 )

// Mean length of Hindu sidereal year.
const HINDU_SIDEREAL_YEAR = 365 + 279457 / 1080000

// Mean length of Hindu sidereal month.
const HINDU_SIDEREAL_MONTH = 27 + 4644439 / 14438334

// Mean time from new moon to new moon.
const HINDU_SYNODIC_MONTH = 29 + 7087771 / 13358334

// Fixed date of Hindu creation.
const HINDU_CREATION = HINDU_EPOCH - 1955880000 * HINDU_SIDEREAL_YEAR

// Time from aphelion to aphelion.
const HINDU_ANOMALISTIC_YEAR = 1577917828000 / ( 4320000000 - 387 )

// Time from apogee to apogee, with bija correction.
const HINDU_ANOMALISTIC_MONTH = 1577917828 / ( 57753336 - 488199 )

// Location of Ujjain.
const UJJAIN = {
  latitude: angle( 23, 9, 0 ),
  longitude: angle( 75, 46, 6 ),
  elevation: 0,
  zone: hr( 5 + 461 / 9000 ),
}

// Elapsed days (Ahargana) to date since Hindu epoch (KY).
const hinduDayCount = date => date - HINDU_EPOCH

// This simulates the Hindu sine table.
// entry is an angle given as a multiplier of 225'.
const hinduSineTable = entry => {
  const exact = 3438 * sinDegrees( entry * angle( 0, 225, 0 ) )
  const error = 0.215 * Math.sign( exact ) * Math.sign( Math.abs( exact ) - 1716 )
  return ( 1 / 3438 ) * Math.round( exact + error )
}

// Linear interpolation for theta in Hindu table.
const hinduSine = theta => {
  const entry = theta / angle( 0, 225, 0 )
  const fraction = mod( entry, 1 )
  return fraction * hinduSineTable( Math.ceil( entry ) )
    + ( 1 - fraction ) * hinduSineTable( Math.floor( entry ) )
}

// Inverse of Hindu sine function of amp.
const hinduArcsin = amp => {
  if ( amp < 0 ) {
    return -hinduArcsin( -amp )
  }
  const pos = next( 0, ( k => amp <= hinduSineTable( k ) ) )
  const below = hinduSineTable( pos - 1 )
  return angle( 0, 225, 0 ) * ( pos - 1
    + ( ( amp - below ) / ( hinduSineTable( pos ) - below ) ) )
}

// Position in degrees at moment tee in uniform circular orbit of period days.
const hinduMeanPosition = ( tee, period ) => 360 * mod( ( tee - HINDU_CREATION ) / period, 1 )

// Longitudinal position at moment tee.
// period is period of mean motion in days.
// size is ratio of radii of epicycle and deferent.
// anomalistic is the period of retrograde revolution about epicycle.
// change is maximum decrease in epicycle size.
const hinduTruePosition = ( tee, period, size, anomalistic, change ) => {
  const lambda = hinduMeanPosition( tee, period )
  const offset = hinduSine( hinduMeanPosition( tee, anomalistic ) )
  const contraction = Math.abs( offset ) * change * size
  const equation = hinduArcsin( offset * ( size - contraction ) )
  return mod( lambda - equation, 360 )
}

// Solar longitude at moment tee.
const hinduSolarLongitude = tee => (
  hinduTruePosition( tee,
    HINDU_SIDEREAL_YEAR,
    14 / 360,
    HINDU_ANOMALISTIC_YEAR,
    1 / 42 )
)

// Zodiacal sign of the sun, as integer in range 1..12, at moment tee.
const hinduZodiac = tee => Math.floor( hinduSolarLongitude( tee ) / 30 ) + 1

// Lunar longitude at moment tee.
const hinduLunarLongitude = tee => (
  hinduTruePosition( tee,
    HINDU_SIDEREAL_MONTH,
    32 / 360,
    HINDU_ANOMALISTIC_MONTH,
    1 / 96 )
)

// Longitudinal distance between the sun and moon at moment tee.
const hinduLunarPhase = tee => (
  mod( hinduLunarLongitude( tee ) - hinduSolarLongitude( tee ), 360 )
)

// Phase of moon (tithi) at moment tee, as an integer in the range 1..30.
const hinduLunarDayFromMoment = tee => Math.floor( hinduLunarPhase( tee ) / 12 ) + 1

// Approximate moment of last new moon preceding moment
// tee, close enough to determine zodiacal sign.
const hinduNewMoonBefore = tee => {
  const varepsilon = 2 ** -1000
  const tau = tee - ( 1 / 360 ) * hinduLunarPhase( tee ) * HINDU_SYNODIC_MONTH
  const p = ( l, u ) => (
    hinduZodiac( l ) === hinduZodiac( u ) || ( u - l ) < varepsilon
  )
  return binarySearch( tau - 1, Math.min( tee, tau + 1 ), p, ( x => hinduLunarPhase( x ) < 180 ) )
}

// Determine solar year at given moment tee.
const hinduCalendarYear = tee => (
  Math.round(
    ( ( tee - HINDU_EPOCH ) / HINDU_SIDEREAL_YEAR ) - ( hinduSolarLongitude( tee ) / 360 ),
  )
)

// Sidereal daily motion of sun on date.
const hinduDailyMotion = date => {
  const meanMotion = 360 / HINDU_SIDEREAL_YEAR
  const anomaly = hinduMeanPosition( date, HINDU_ANOMALISTIC_YEAR )
  const epicycle = 14 / 360 - ( 1 / 1080 ) * Math.abs( hinduSine( anomaly ) )
  const entry = Math.floor( anomaly / angle( 0, 225, 0 ) )
  const sineTableStep = hinduSineTable( entry + 1 ) - hinduSineTable( entry )
  const factor = ( -3438 / 225 ) * sineTableStep * epicycle
  return meanMotion * ( factor + 1 )
}

// Hindu tropical longitude on fixed date.
// Assumes precession with maximum of 27 degrees and period of 7200 sidereal years
// (= 1577917828/600 days).
const hinduTropicalLongitude = date => {
  const days = date - HINDU_EPOCH
  const precession = 27 - Math.abs(
    108 * mod3( ( 600 / 1577917828 ) * days - ( 1 / 4 ), -1 / 2, 1 / 2 ),
  )
  return mod( hinduSolarLongitude( date ) - precession, 360 )
}

// Difference between right and oblique ascension of sun on date at location.
const hinduAscensionalDifference = ( date, location ) => {
  const sinDelta = ( 1397 / 3438 ) * hinduSine( hinduTropicalLongitude( date ) )
  const phi = location.latitude
  const diurnalRadius = hinduSine( 90 + hinduArcsin( sinDelta ) )
  const tanPhi = hinduSine( phi ) / hinduSine( 90 + phi )
  const earthSine = sinDelta * tanPhi
  return hinduArcsin( -earthSine / diurnalRadius )
}

// Tabulated speed of rising of current zodiacal sign on date.
const hinduRisingSign = date => {
  const i = Math.floor( hinduTropicalLongitude( date ) / 30 )
  // eslint-disable-next-line max-len
  return [ 1670 / 1800, 1795 / 1800, 1935 / 1800, 1935 / 1800, 1795 / 1800, 1670 / 1800 ][ mod( i, 6 ) ]
}

// Difference between solar and sidereal day on date.
const hinduSolarSiderealDifference = date => hinduDailyMotion( date ) * hinduRisingSign( date )

// Time from true to mean midnight of date.
// (This is a gross approximation to the correct value.)
const hinduEquationOfTime = date => {
  const offset = hinduSine( hinduMeanPosition( date, HINDU_ANOMALISTIC_YEAR ) )
  const equationSun = offset * angle( 57, 18, 0 )
    * ( ( 14 / 360 ) - ( Math.abs( offset ) / 1080 ) )
  return ( hinduDailyMotion( date ) / 360 )
    * ( equationSun / 360 )
    * HINDU_SIDEREAL_YEAR
}

// Difference between tropical and sidereal solar longitude.
const ayanamsha = tee => mod3( solarLongitude( tee ) - siderealSolarLongitude( tee ), -180, 180 )

// Sidereal zodiacal sign of the sun, as integer in range 1..12, at moment tee.
const siderealZodiac = tee => Math.floor( siderealSolarLongitude( tee ) / 30 ) + 1

// Astronomical Hindu solar year KY at given moment tee.
const astroHinduCalendarYear = tee => (
  Math.round(
    ( ( tee - HINDU_EPOCH ) / MEAN_SIDEREAL_YEAR ) - ( siderealSolarLongitude( tee ) / 360 ),
  )
)

// Phase of moon (tithi) at moment tee, as an integer in the range 1..30.
const astroLunarDayFromMoment = tee => Math.floor( lunarPhase( tee ) / 12 ) + 1

// Moment of the first time at or after tee
// when Hindu solar longitude will be lambda degrees.
const hinduSolarLongitudeAtOrAfter = ( lambda, tee ) => {
  const tau = tee + HINDU_SIDEREAL_YEAR * ( 1 / 360 )
    * mod( lambda - hinduSolarLongitude( tee ), 360 )
  const a = Math.max( tee, tau - 5 )
  const b = tau + 5
  return invertAngular( hinduSolarLongitude, lambda, a, b )
}

// Time lunar-day (tithi) number k begins at or after
// moment tee.  k can be fractional (for karanas).
const hinduLunarDayAtOrAfter = ( k, tee ) => {
  const phase = ( k - 1 ) * 12
  const tau = tee + ( 1 / 360 )
    * mod( phase - hinduLunarPhase( tee ), 360 ) * HINDU_SYNODIC_MONTH
  const a = Math.max( tee, tau - 2 )
  const b = tau + 2
  return invertAngular( hinduLunarPhase, phase, a, b )
}

// True if Hindu lunar date l-date1 is on or before
// Hindu lunar date l-date2.
const isHinduLunarOnOrBefore = ( lDate1, lDate2 ) => (
  ( lDate1.year < lDate2.year )
    || ( ( lDate1.year === lDate2.year )
    && ( ( lDate1.month < lDate2.month )
    || ( ( lDate1.month1 === lDate2.month2 )
    && ( ( lDate1.leapMonth && !lDate2.leapMonth )
    || ( ( lDate1.leapMonth === lDate2.leapMonth )
    && ( ( lDate1.day < lDate2.day )
    || ( ( lDate1.day === lDate2.day )
    && ( ( !lDate1.leapDay ) || lDate2.leapDay ) ) ) ) ) ) ) )
)

const ModernHindu = class {
  static HINDU_EPOCH = HINDU_EPOCH

  static HINDU_SIDEREAL_YEAR = HINDU_SIDEREAL_YEAR

  static HINDU_SIDEREAL_MONTH = HINDU_SIDEREAL_MONTH

  static HINDU_SYNODIC_MONTH = HINDU_SYNODIC_MONTH

  static HINDU_CREATION = HINDU_CREATION

  static HINDU_ANOMALISTIC_YEAR = HINDU_ANOMALISTIC_YEAR

  static HINDU_ANOMALISTIC_MONTH = HINDU_ANOMALISTIC_MONTH

  static UJJAIN = UJJAIN

  static hinduDayCount = hinduDayCount

  static hinduSineTable = hinduSineTable

  static hinduSine = hinduSine

  static hinduArcsin = hinduArcsin

  static hinduMeanPosition = hinduMeanPosition

  static hinduTruePosition = hinduTruePosition

  static hinduSolarLongitude = hinduSolarLongitude

  static hinduZodiac = hinduZodiac

  static hinduLunarLongitude = hinduLunarLongitude

  static hinduLunarPhase = hinduLunarPhase

  static hinduLunarDayFromMoment = hinduLunarDayFromMoment

  static hinduNewMoonBefore = hinduNewMoonBefore

  static hinduCalendarYear = hinduCalendarYear

  static hinduDailyMotion = hinduDailyMotion

  static hinduTropicalLongitude = hinduTropicalLongitude

  static hinduAscensionalDifference = hinduAscensionalDifference

  static hinduRisingSign = hinduRisingSign

  static hinduSolarSiderealDifference = hinduSolarSiderealDifference

  static hinduEquationOfTime = hinduEquationOfTime

  static ayanamsha = ayanamsha

  static siderealZodiac = siderealZodiac

  static astroHinduCalendarYear = astroHinduCalendarYear

  static astroLunarDayFromMoment = astroLunarDayFromMoment

  static hinduSolarLongitudeAtOrAfter = hinduSolarLongitudeAtOrAfter

  static hinduLunarDayAtOrAfter = hinduLunarDayAtOrAfter

  static isHinduLunarOnOrBefore = isHinduLunarOnOrBefore

  constructor( { location, solarEra, lunarEra, oldSunrise } = {} ) {
    // Location (Ujjain) for determining Hindu calendar.
    this.HINDU_LOCATION = location || UJJAIN

    // Years from Kali Yuga until Saka era.
    this.HINDU_SOLAR_ERA = solarEra || 3179

    // Years from Kali Yuga until Vikrama era.
    this.HINDU_LUNAR_ERA = lunarEra || 3044

    // Select sunrise method for Surya Sidhantta
    this.ssSunrise = oldSunrise
      ? this.hinduSunrise
      : date => localFromStandard( this.astroHinduSunrise( date ), this.HINDU_LOCATION )
  }

  // Sunrise at hindu-location on date.
  hinduSunrise = date => (
    date + hr( 6 )
      + ( ( UJJAIN.longitude - this.HINDU_LOCATION.longitude ) / 360 )
      - hinduEquationOfTime( date )
      + ( 1577917828 / ( 1582237828 * 360 ) )
      * ( hinduAscensionalDifference( date, this.HINDU_LOCATION )
        + ( 1 / 4 ) * hinduSolarSiderealDifference( date )
      )
  )

  // Sunset at hindu-location on date.
  hinduSunset = date => (
    date + hr( 18 )
      + ( ( UJJAIN.longitude - this.HINDU_LOCATION.longitude ) / 360 )
      - hinduEquationOfTime( date )
      + ( 1577917828 / ( 1582237828 * 360 ) )
      * ( -hinduAscensionalDifference( date, this.HINDU_LOCATION )
        + ( 3 / 4 ) * hinduSolarSiderealDifference( date )
      )
  )

  // Return the astronomical sunrise at Hindu location on date, date,
  // per Lahiri, rounded to nearest minute, as a rational number.
  astroHinduSunrise = date => {
    const rise = dawn( date, this.HINDU_LOCATION, angle( 0, 47, 0 ) )
    return ( ( 1 / 60 ) / 24 ) * Math.round( rise * 24 * 60 )
  }

  // Hindu (Orissa) solar date equivalent to fixed date.
  hinduSolarFromFixed = date => {
    const critical = this.ssSunrise( date + 1 )
    const month = hinduZodiac( critical )
    const year = hinduCalendarYear( critical ) - this.HINDU_SOLAR_ERA
    const approx = date - 3 - mod( Math.floor( hinduSolarLongitude( critical ) ), 30 )
    const start = next( approx, i => hinduZodiac( this.ssSunrise( i + 1 ) ) === month )
    const day = date - start + 1
    return { year, month, day }
  }

  // Fixed date corresponding to Hindu solar date s-date
  fixedFromHinduSolar = ( year, month, day ) => {
    const start = Math.floor(
      ( year + this.HINDU_SOLAR_ERA + ( ( month - 1 ) / 12 ) ) * HINDU_SIDEREAL_YEAR,
    ) + HINDU_EPOCH
    return day - 1 + next( start - 3, d => hinduZodiac( this.ssSunrise( d + 1 ) ) === month )
  }

  // Hindu lunar date, new-moon scheme, equivalent to fixed date.
  hinduLunarFromFixed = date => {
    const critical = this.ssSunrise( date )
    const day = hinduLunarDayFromMoment( critical )
    const leapDay = day === hinduLunarDayFromMoment( this.ssSunrise( date - 1 ) )
    const lastNewMoon = hinduNewMoonBefore( critical )
    const nextNewMoon = hinduNewMoonBefore( Math.floor( lastNewMoon ) + 35 )
    const solarMonth = hinduZodiac( lastNewMoon )
    const leapMonth = solarMonth === hinduZodiac( nextNewMoon )
    const month = amod( solarMonth + 1, 12 )
    const year = hinduCalendarYear( month <= 2 ? date + 180 : date ) - this.HINDU_LUNAR_ERA
    return { year, month, leapMonth, day, leapDay }
  }

  // Fixed date corresponding to Hindu lunar date.
  fixedFromHinduLunar = ( year, month, leapMonth = false, day, leapDay = false ) => {
    const approx = HINDU_EPOCH + HINDU_SIDEREAL_YEAR
      * ( year + this.HINDU_LUNAR_ERA + ( ( month - 1 ) / 12 ) )
    const s = Math.floor( approx - HINDU_SIDEREAL_YEAR
      * mod3( ( hinduSolarLongitude( approx ) / 360 ) - ( ( month - 1 ) / 12 ), -1 / 2, 1 / 2 ) )
    const k = hinduLunarDayFromMoment( s + hr( 6 ) )
    const mid = this.hinduLunarFromFixed( s - 15 )
    let est = s + day
    if ( k > 3 && k < 27 ) {
      est -= k
    } else if ( mid.month !== month || ( mid.leapMonth && !leapMonth ) ) {
      est -= mod3( k, -15, 15 )
    } else {
      est -= mod3( k, 15, 45 )
    }
    const tau = est - mod3( hinduLunarDayFromMoment( est + hr( 6 ) ) - day, -15, 15 )
    const date = next( tau - 1, ( d => [ day, amod( day + 1, 30 ) ].includes(
      hinduLunarDayFromMoment( this.ssSunrise( d ) ),
    ) ) )
    return leapDay ? date + 1 : date
  }

  // Hindu lunar date, full-moon scheme, equivalent to fixed date.
  hinduFullmoonFromFixed = date => {
    const { year, month, leapMonth, day, leapDay } = this.hinduLunarFromFixed( date )
    const m = day >= 16 ? this.hinduLunarFromFixed( date + 20 ).month : month
    return { year, month: m, leapMonth, day, leapDay }
  }

  // True if Hindu lunar month month in year is expunged.
  isHinduExpunged = ( year, month ) => (
    month !== this.hinduLunarFromFixed(
      this.fixedFromHinduLunar( year, month, false, 15, false ),
    ).month
  )

  // Fixed date equivalent to Hindu lunar date in full-moon scheme.
  fixedFromHinduFullmoon = ( year, month, leapMonth = false, day, leapDay = false ) => {
    let m
    if ( leapMonth || day <= 15 ) {
      m = month
    } else if ( this.isHinduExpunged( year, amod( month - 1, 12 ) ) ) {
      m = amod( month - 2, 12 )
    } else {
      m = amod( month - 1, 12 )
    }
    return this.fixedFromHinduLunar( year, m, leapMonth, day, leapDay )
  }

  // Geometrical sunset at Hindu location on date.
  astroHinduSunset = date => dusk( date, this.HINDU_LOCATION, angle( 0, 47, 0 ) )

  // Astronomical Hindu solar date equivalent to fixed date.
  astroHinduSolarFromFixed = date => {
    const critical = universalFromStandard(
      this.astroHinduSunrise( date + 1 ), this.HINDU_LOCATION,
    )
    const month = siderealZodiac( critical )
    const year = astroHinduCalendarYear( critical ) - this.HINDU_SOLAR_ERA
    const approx = date - 3 - mod( Math.floor( siderealSolarLongitude( critical ) ), 30 )
    const start = next( approx, i => siderealZodiac(
      universalFromStandard( this.astroHinduSunrise( i + 1 ), this.HINDU_LOCATION ),
    ) === month )
    const day = date - start + 1
    return { year, month, day }
  }

  // Fixed date corresponding to Astronomical Hindu solar date
  fixedFromAstroHinduSolar = ( year, month, day ) => {
    const approx = HINDU_EPOCH - 3
      + Math.floor( ( year + this.HINDU_SOLAR_ERA + ( ( month - 1 ) / 12 ) ) * MEAN_SIDEREAL_YEAR )
    const start = next( approx, i => siderealZodiac(
      universalFromStandard( this.astroHinduSunrise( i + 1 ), this.HINDU_LOCATION ),
    ) === month )
    return start + day - 1
  }

  // Astronomical Hindu lunar date equivalent to fixed date.
  astroHinduLunarFromFixed = date => {
    const critical = universalFromStandard( this.astroHinduSunrise( date ), this.HINDU_LOCATION )
    const day = astroLunarDayFromMoment( critical )
    const leapDay = day === astroLunarDayFromMoment(
      universalFromStandard( this.astroHinduSunrise( date - 1 ), this.HINDU_LOCATION ),
    )
    const lastNewMoon = newMoonBefore( critical )
    const nextNewMoon = newMoonAtOrAfter( critical )
    const solarMonth = siderealZodiac( lastNewMoon )
    const leapMonth = solarMonth === siderealZodiac( nextNewMoon )
    const month = amod( solarMonth + 1, 12 )
    const year = astroHinduCalendarYear( month <= 2 ? date + 180 : date ) - this.HINDU_LUNAR_ERA
    return { year, month, leapMonth, day, leapDay }
  }

  // Fixed date corresponding to Hindu lunar date ldate.
  fixedFromAstroHinduLunar = ( year, month, leapMonth = false, day, leapDay = false ) => {
    const approx = HINDU_EPOCH + MEAN_SIDEREAL_YEAR
      * ( year + this.HINDU_LUNAR_ERA + ( ( month - 1 ) / 12 ) )
    const s = Math.floor( approx - HINDU_SIDEREAL_YEAR
      * mod3( ( siderealSolarLongitude( approx ) / 360 ) - ( ( month - 1 ) / 12 ), -1 / 2, 1 / 2 ) )
    const k = astroLunarDayFromMoment( s + hr( 6 ) )
    const mid = this.astroHinduLunarFromFixed( s - 15 )
    let est = s + day
    if ( k > 3 && k < 27 ) {
      est -= k
    } else if ( mid.month !== month || ( mid.leapMonth && !leapMonth ) ) {
      est -= mod3( k, -15, 15 )
    } else {
      est -= mod3( k, 15, 45 )
    }
    const tau = est - mod3( astroLunarDayFromMoment( est + hr( 6 ) ) - day, -15, 15 )
    const date = next( tau - 1, ( d => (
      [ day, amod( day + 1, 30 ) ].includes(
        astroLunarDayFromMoment(
          universalFromStandard( this.astroHinduSunrise( d ), this.HINDU_LOCATION ),
        ),
      )
    ) ) )
    return leapDay ? date + 1 : date
  }

  // Fixed date of occurrence of Hindu lunar l-month,
  // l-day in Hindu lunar year l-year,
  // taking leap and expunged days into account.
  // When the month is expunged, then the following month is used.
  hinduDateOccur = ( lYear, lMonth, lDay ) => {
    const ttry = this.fixedFromHinduLunar( lYear, lMonth, false, lDay, false )
    const mid = this.hinduLunarFromFixed( lDay > 15 ? ttry - 5 : ttry )
    const isExpunged = lMonth !== mid.month
    const lDate = {
      year: mid.year, month: mid.month, leapMonth: mid.leapMonth, day: lDay, leapDay: false,
    }
    if ( isExpunged ) {
      return next( ttry, d => !isHinduLunarOnOrBefore( this.hinduLunarFromFixed( d ), lDate ) ) - 1
    }
    if ( lDay !== this.hinduLunarFromFixed( ttry ).day ) {
      return ttry - 1
    }
    return ttry
  }

  // Hindu lunar station (nakshatra) at sunrise on date.
  hinduLunarStation = date => {
    const critical = this.ssSunrise( date )
    return Math.floor( hinduLunarLongitude( critical ) / angle( 0, 800, 0 ) ) + 1
  }
}

module.exports = ModernHindu
