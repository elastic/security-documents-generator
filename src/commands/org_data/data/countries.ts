/**
 * Country data for employee location generation
 * Includes major tech hub countries with realistic distribution
 */

export interface Country {
  name: string;
  code: string;
  timezone: string;
  cities: string[];
  weight: number; // Relative probability of selection
}

/**
 * Countries where SaaS companies typically have employees
 * Weighted by typical remote workforce distribution
 */
export const COUNTRIES: Country[] = [
  // North America (high weight - HQ locations)
  {
    name: 'United States',
    code: 'US',
    timezone: 'America/Los_Angeles',
    cities: [
      'San Francisco',
      'New York',
      'Seattle',
      'Austin',
      'Denver',
      'Los Angeles',
      'Boston',
      'Chicago',
      'Miami',
      'Portland',
      'San Diego',
      'Atlanta',
    ],
    weight: 40,
  },
  {
    name: 'Canada',
    code: 'CA',
    timezone: 'America/Toronto',
    cities: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary'],
    weight: 10,
  },

  // Europe
  {
    name: 'United Kingdom',
    code: 'GB',
    timezone: 'Europe/London',
    cities: ['London', 'Manchester', 'Edinburgh', 'Bristol', 'Cambridge'],
    weight: 10,
  },
  {
    name: 'Germany',
    code: 'DE',
    timezone: 'Europe/Berlin',
    cities: ['Berlin', 'Munich', 'Frankfurt', 'Hamburg', 'Cologne'],
    weight: 5,
  },
  {
    name: 'France',
    code: 'FR',
    timezone: 'Europe/Paris',
    cities: ['Paris', 'Lyon', 'Toulouse', 'Nice', 'Bordeaux'],
    weight: 3,
  },
  {
    name: 'Netherlands',
    code: 'NL',
    timezone: 'Europe/Amsterdam',
    cities: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht'],
    weight: 3,
  },
  {
    name: 'Ireland',
    code: 'IE',
    timezone: 'Europe/Dublin',
    cities: ['Dublin', 'Cork', 'Galway'],
    weight: 3,
  },
  {
    name: 'Spain',
    code: 'ES',
    timezone: 'Europe/Madrid',
    cities: ['Madrid', 'Barcelona', 'Valencia', 'Seville'],
    weight: 2,
  },
  {
    name: 'Poland',
    code: 'PL',
    timezone: 'Europe/Warsaw',
    cities: ['Warsaw', 'Krakow', 'Wroclaw', 'Poznan'],
    weight: 3,
  },
  {
    name: 'Portugal',
    code: 'PT',
    timezone: 'Europe/Lisbon',
    cities: ['Lisbon', 'Porto', 'Braga'],
    weight: 2,
  },

  // Asia Pacific
  {
    name: 'India',
    code: 'IN',
    timezone: 'Asia/Kolkata',
    cities: ['Bangalore', 'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Delhi', 'Gurgaon'],
    weight: 8,
  },
  {
    name: 'Australia',
    code: 'AU',
    timezone: 'Australia/Sydney',
    cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
    weight: 3,
  },
  {
    name: 'Singapore',
    code: 'SG',
    timezone: 'Asia/Singapore',
    cities: ['Singapore'],
    weight: 2,
  },
  {
    name: 'Japan',
    code: 'JP',
    timezone: 'Asia/Tokyo',
    cities: ['Tokyo', 'Osaka', 'Kyoto', 'Fukuoka'],
    weight: 2,
  },

  // South America
  {
    name: 'Brazil',
    code: 'BR',
    timezone: 'America/Sao_Paulo',
    cities: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba'],
    weight: 2,
  },
  {
    name: 'Argentina',
    code: 'AR',
    timezone: 'America/Buenos_Aires',
    cities: ['Buenos Aires', 'Córdoba', 'Rosario'],
    weight: 1,
  },
  {
    name: 'Mexico',
    code: 'MX',
    timezone: 'America/Mexico_City',
    cities: ['Mexico City', 'Guadalajara', 'Monterrey'],
    weight: 2,
  },
];

/**
 * Get weighted random country
 */
export const getRandomCountry = (random: () => number): Country => {
  const totalWeight = COUNTRIES.reduce((sum, c) => sum + c.weight, 0);
  let threshold = random() * totalWeight;

  for (const country of COUNTRIES) {
    threshold -= country.weight;
    if (threshold <= 0) {
      return country;
    }
  }

  return COUNTRIES[0]; // Fallback to US
};

/**
 * Get random city from a country
 */
export const getRandomCity = (country: Country, random: () => number): string => {
  const index = Math.floor(random() * country.cities.length);
  return country.cities[index];
};

/**
 * Get country by code
 */
export const getCountryByCode = (code: string): Country | undefined => {
  return COUNTRIES.find((c) => c.code === code);
};
