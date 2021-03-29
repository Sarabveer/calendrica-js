const { general: { unixFromMoment } } = require( '../index' )
const rd = require( './rd' )

const results = [
  -80641958400,
  -67439520000,
  -59935161600,
  -57883334400,
  -47334758400,
  -43978291200,
  -40239590400,
  -30190147200,
  -27568339200,
  -24607411200,
  -23030611200,
  -21513859200,
  -21196166400,
  -18257443200,
  -16848604800,
  -15075676800,
  -13136688000,
  -12932870400,
  -10147420800,
  -9135849600,
  -7997788800,
  -6359817600,
  -4746729600,
  -4126636800,
  -2105049600,
  -1273449600,
  -891734400,
  -842745600,
  -827971200,
  700790400,
  825206400,
  2172960000,
  3930249600,
]

const data = rd.map( ( rd, i ) => [ rd, results[ i ] ] )

describe( 'unixFromMoment()', () => {
  data.map( ( [ rd, result ] ) => it( `Output of unixFromMoment(${rd}) should be: '${result}'`, () => {
    expect( unixFromMoment( rd ) ).toBeCloseTo( result )
  } ) )
} )
