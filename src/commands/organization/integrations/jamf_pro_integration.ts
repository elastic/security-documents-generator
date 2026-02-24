/**
 * Jamf Pro Integration
 * Generates inventory and event documents for jamf_pro data streams
 * Based on the Elastic jamf_pro integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, Device, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

/** Realistic macOS model identifiers */
const MAC_MODEL_IDENTIFIERS = [
  'MacBookPro18,1', // MacBook Pro 16-inch 2021 M1 Pro
  'MacBookPro18,2', // MacBook Pro 16-inch 2021 M1 Max
  'MacBookPro18,3', // MacBook Pro 14-inch 2021 M1 Pro
  'MacBookPro18,4', // MacBook Pro 14-inch 2021 M1 Max
  'MacBookPro17,1', // MacBook Pro 13-inch 2020 M1
  'MacBookAir10,1', // MacBook Air 2020 M1
  'Mac14,2', // MacBook Air 2022 M2
  'Mac14,7', // MacBook Pro 13-inch 2022 M2
  'Mac14,5', // MacBook Pro 14-inch 2023 M2 Pro
  'Mac14,6', // MacBook Pro 16-inch 2023 M2 Pro
  'Mac14,9', // MacBook Pro 14-inch 2023 M2 Max
  'Mac14,10', // MacBook Pro 16-inch 2023 M2 Max
  'Mac15,3', // MacBook Pro 14-inch 2023 M3
  'Mac15,6', // MacBook Pro 14-inch 2023 M3 Pro
  'Mac15,8', // MacBook Pro 16-inch 2023 M3 Pro
  'Mac15,10', // MacBook Pro 16-inch 2023 M3 Max
  'Mac15,13', // MacBook Air 13-inch 2024 M3
];

/** Realistic macOS versions with build numbers */
const MACOS_VERSIONS = [
  { version: '14.2.1', build: '23C71' },
  { version: '14.1.2', build: '23B92' },
  { version: '14.1.1', build: '23B81' },
  { version: '14.0', build: '23A344' },
  { version: '13.6.3', build: '22G436' },
  { version: '13.6.2', build: '22G320' },
  { version: '13.5.2', build: '22G91' },
  { version: '13.4.1', build: '22F82' },
  { version: '12.7.2', build: '21H1123' },
  { version: '12.7.1', build: '21G920' },
];

/** Jamf binary versions */
const JAMF_BINARY_VERSIONS = [
  '11.4.1-t1712591696',
  '11.3.0-t1709234567',
  '11.2.1-t1706987654',
  '11.1.0-t1703456789',
  '10.52.0-t1700123456',
];

/** Webhook event types */
const WEBHOOK_EVENTS = [
  'ComputerAdded',
  'ComputerCheckIn',
  'ComputerInventoryCompleted',
  'ComputerPolicyFinished',
  'ComputerPushCapabilityChanged',
];

/**
 * Jamf Pro Integration
 * Generates macOS computer inventory and webhook event documents
 */
export class JamfProIntegration extends BaseIntegration {
  readonly packageName = 'jamf_pro';
  readonly displayName = 'Jamf Pro';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'inventory',
      index: 'logs-jamf_pro.inventory-default',
    },
    {
      name: 'events',
      index: 'logs-jamf_pro.events-default',
    },
  ];

  /**
   * Generate all Jamf Pro documents
   */
  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const inventoryDocs: IntegrationDocument[] = [];
    const eventDocs: IntegrationDocument[] = [];

    // Generate inventory + event documents for Mac laptops only
    for (const employee of org.employees) {
      const macDevices = employee.devices.filter(
        (d) => d.type === 'laptop' && d.platform === 'mac'
      );
      for (const device of macDevices) {
        const udid = faker.string.uuid().toUpperCase();
        correlationMap.jamfUdidToDevice.set(udid, { employee, device });

        const jssId = faker.string.numeric(7);

        // Inventory document
        inventoryDocs.push(this.createInventoryDocument(device, employee, org, udid, jssId));

        // 1-2 webhook event documents per device
        const eventCount = faker.number.int({ min: 1, max: 2 });
        for (let i = 0; i < eventCount; i++) {
          eventDocs.push(this.createEventDocument(device, employee, org, udid, jssId));
        }
      }
    }

    documentsMap.set(this.dataStreams[0].index, inventoryDocs);
    documentsMap.set(this.dataStreams[1].index, eventDocs);
    return documentsMap;
  }

  /**
   * Create a Jamf Pro inventory document
   * Matches the jamf_pro.inventory data stream schema
   */
  private createInventoryDocument(
    device: Device,
    employee: Employee,
    org: Organization,
    udid: string,
    jssId: string
  ): IntegrationDocument {
    const osInfo = faker.helpers.arrayElement(MACOS_VERSIONS);
    const lastContactTime = faker.date.recent({ days: 1 }).toISOString();
    const lastReportDate = faker.date.recent({ days: 3 }).toISOString();
    const lastEnrolledDate = faker.date.past({ years: 1 }).toISOString();
    const initialEntryDate = faker.date.past({ years: 2 }).toISOString().split('T')[0];
    const ipAddress = `10.${faker.number.int({ min: 0, max: 255 })}.${faker.number.int({ min: 0, max: 255 })}.${faker.number.int({ min: 1, max: 254 })}`;
    const managementId = faker.string.uuid();

    const inventoryPayload = {
      id: jssId,
      udid: udid,
      general: {
        name: `${org.name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${device.serialNumber}`,
        platform: 'Mac',
        last_ip_address: ipAddress,
        last_reported_ip: ipAddress,
        serial_number: device.serialNumber,
        last_contact_time: lastContactTime,
        report_date: lastReportDate,
        last_enrolled_date: lastEnrolledDate,
        initial_entry_date: initialEntryDate,
        management_id: managementId,
        jamf_binary_version: faker.helpers.arrayElement(JAMF_BINARY_VERSIONS),
        mdm_capable: { capable: true },
        remote_management: { managed: true },
        supervised: false,
        user_approved_mdm: true,
        declarative_device_management_enabled: false,
        enrolled_via_automated_device_enrollment: faker.datatype.boolean(0.6),
        itunes_store_account_active: false,
        site: { id: '-1', name: 'None' },
        barcode1: 'null',
      },
      user_and_location: {
        username: employee.userName,
        realname: `${employee.firstName} ${employee.lastName}`,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        email_address: employee.email,
        position: employee.role,
        department: employee.department,
      },
      operating_system: {
        name: 'macOS',
        version: osInfo.version,
      },
      hardware: {
        mac_address: faker.internet.mac({ separator: ':' }).toLowerCase(),
      },
    };

    return {
      '@timestamp': this.getRandomTimestamp(24),
      message: inventoryPayload,
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'jamf_pro.inventory',
      },
      tags: ['forwarded', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  /**
   * Create a Jamf Pro webhook event document
   * Matches the jamf_pro.events data stream schema
   */
  private createEventDocument(
    device: Device,
    employee: Employee,
    org: Organization,
    udid: string,
    jssId: string
  ): IntegrationDocument {
    const webhookEvent = faker.helpers.arrayElement(WEBHOOK_EVENTS);
    const ipAddress = `${faker.number.int({ min: 1, max: 223 })}.${faker.number.int({ min: 0, max: 255 })}.${faker.number.int({ min: 0, max: 255 })}.${faker.number.int({ min: 1, max: 254 })}`;
    const modelId = faker.helpers.arrayElement(MAC_MODEL_IDENTIFIERS);
    const osInfo = faker.helpers.arrayElement(MACOS_VERSIONS);
    const macAddress = Array.from({ length: 6 }, () =>
      faker.string.hexadecimal({ length: 2, prefix: '' }).toLowerCase()
    ).join(':');

    return {
      '@timestamp': this.getRandomTimestamp(48),
      json: {
        event: {
          udid: udid,
          device_name: `${employee.firstName}'s MacBook Pro`,
          model: modelId,
          serial_number: device.serialNumber,
          os_version: osInfo.version,
          os_build: osInfo.build,
          ip_address: ipAddress,
          reported_ip_address: ipAddress,
          mac_address: macAddress,
          alternate_mac_address: macAddress,
          username: `${employee.firstName} ${employee.lastName}`,
          real_name: `${employee.firstName} ${employee.lastName}`,
          email_address: employee.email,
          phone: faker.phone.number({ style: 'international' }),
          position: employee.role,
          department: employee.department,
          building: faker.helpers.arrayElement([
            'HQ Main',
            'Engineering Center',
            'Downtown Office',
            'Innovation Hub',
            'West Campus',
          ]),
          room: `${faker.number.int({ min: 1, max: 5 })}${faker.string.numeric(2)}`,
          jss_id: jssId,
          management_id: faker.string.uuid(),
          user_directory_id: faker.string.numeric(10),
        },
        webhook: {
          event_timestamp: new Date(
            Date.now() - faker.number.int({ min: 0, max: 48 * 60 * 60 * 1000 })
          ).toISOString(),
          id: faker.string.numeric(10),
          name: `${org.name}-webhook`,
          webhook_event: webhookEvent,
        },
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'jamf_pro.events',
      },
      tags: ['forwarded', 'jamf_pro-events', 'preserve_original_event'],
    } as IntegrationDocument;
  }
}
