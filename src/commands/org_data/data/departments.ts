/**
 * Department definitions for SaaS organizations
 * Based on realistic SaaS/CRM company structure
 */

import { Department, DepartmentName } from '../types';

/**
 * Department configuration with realistic distribution
 * Percentages should sum to approximately 100%
 */
export const DEPARTMENTS: Department[] = [
  {
    name: 'Product & Engineering',
    percentage: 0.4, // 40% of employees
    hasCloudAccess: true,
    roles: [
      'Software Engineer',
      'Senior Software Engineer',
      'Staff Engineer',
      'Principal Engineer',
      'Engineering Manager',
      'DevOps Engineer',
      'Site Reliability Engineer',
      'QA Engineer',
      'Senior QA Engineer',
      'Product Manager',
      'Senior Product Manager',
      'Technical Lead',
      'Data Engineer',
      'Security Engineer',
      'Platform Engineer',
      'Frontend Engineer',
      'Backend Engineer',
      'Full Stack Engineer',
      'Mobile Engineer',
      'Infrastructure Engineer',
    ],
  },
  {
    name: 'Sales & Marketing',
    percentage: 0.2, // 20% of employees
    hasCloudAccess: false,
    roles: [
      'Sales Representative',
      'Senior Sales Representative',
      'Account Executive',
      'Senior Account Executive',
      'Sales Manager',
      'Regional Sales Director',
      'Sales Development Representative',
      'Business Development Representative',
      'Marketing Specialist',
      'Senior Marketing Specialist',
      'Marketing Manager',
      'Content Marketing Manager',
      'Digital Marketing Specialist',
      'Product Marketing Manager',
      'Growth Marketing Manager',
      'Demand Generation Manager',
      'Brand Manager',
      'Marketing Analyst',
    ],
  },
  {
    name: 'Customer Success',
    percentage: 0.15, // 15% of employees
    hasCloudAccess: false,
    roles: [
      'Customer Success Manager',
      'Senior Customer Success Manager',
      'Customer Success Director',
      'Technical Support Specialist',
      'Senior Technical Support Specialist',
      'Support Engineer',
      'Customer Support Representative',
      'Customer Support Manager',
      'Implementation Specialist',
      'Solutions Architect',
      'Technical Account Manager',
      'Onboarding Specialist',
      'Customer Experience Manager',
    ],
  },
  {
    name: 'Operations',
    percentage: 0.15, // 15% of employees
    hasCloudAccess: false,
    roles: [
      'HR Manager',
      'Senior HR Manager',
      'HR Coordinator',
      'Recruiter',
      'Senior Recruiter',
      'Talent Acquisition Specialist',
      'Finance Manager',
      'Senior Accountant',
      'Financial Analyst',
      'Accounts Payable Specialist',
      'Accounts Receivable Specialist',
      'Legal Counsel',
      'Paralegal',
      'Office Manager',
      'Executive Assistant',
      'Administrative Assistant',
      'IT Support Specialist',
      'Facilities Manager',
      'Procurement Specialist',
      'Compliance Officer',
    ],
  },
  {
    name: 'Executive',
    percentage: 0.1, // 10% of employees (will be scaled down for larger orgs)
    hasCloudAccess: true, // Executives may have read access
    roles: [
      'Chief Executive Officer',
      'Chief Technology Officer',
      'Chief Financial Officer',
      'Chief Operating Officer',
      'Chief Revenue Officer',
      'Chief Marketing Officer',
      'Chief People Officer',
      'Chief Product Officer',
      'VP of Engineering',
      'VP of Sales',
      'VP of Marketing',
      'VP of Customer Success',
      'VP of Product',
      'VP of Operations',
      'VP of Finance',
      'Director of Engineering',
      'Director of Product',
      'Director of Sales',
      'Director of Marketing',
      'Director of HR',
    ],
  },
];

/**
 * Get department by name
 */
export const getDepartment = (name: DepartmentName): Department | undefined => {
  return DEPARTMENTS.find((d) => d.name === name);
};

/**
 * Get all department names
 */
export const getDepartmentNames = (): DepartmentName[] => {
  return DEPARTMENTS.map((d) => d.name);
};

/**
 * Get departments with cloud access (for AWS correlation)
 */
export const getCloudAccessDepartments = (): Department[] => {
  return DEPARTMENTS.filter((d) => d.hasCloudAccess);
};

/**
 * Validate department percentages sum to approximately 100%
 */
export const validateDepartmentPercentages = (): boolean => {
  const total = DEPARTMENTS.reduce((sum, d) => sum + d.percentage, 0);
  return Math.abs(total - 1.0) < 0.01; // Allow 1% tolerance
};
