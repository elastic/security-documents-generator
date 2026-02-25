/**
 * Cloud Asset Inventory Integration
 * Generates cloud asset documents for AWS, GCP, and Azure resources
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import {
  Organization,
  CloudResource,
  CloudIamUser,
  CloudAssetDocument,
  CorrelationMap,
  Host,
} from '../types';
import { faker } from '@faker-js/faker';

/**
 * Cloud Asset Inventory Integration
 */
export class CloudAssetIntegration extends BaseIntegration {
  readonly packageName = 'cloud_asset_inventory';
  readonly displayName = 'Cloud Asset Inventory';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'asset_inventory',
      index: 'logs-cloud_asset_inventory.asset_inventory-default',
    },
  ];

  /**
   * Generate all cloud asset documents
   */
  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    // Generate documents for cloud resources
    for (const resource of org.cloudResources) {
      documents.push(this.createCloudResourceDocument(resource, org));
    }

    // Generate documents for IAM users (correlated with Okta)
    for (const iamUser of org.cloudIamUsers) {
      const correlatedEmployee = iamUser.oktaUserId
        ? correlationMap.oktaUserIdToEmployee.get(iamUser.oktaUserId)
        : undefined;

      documents.push(this.createIamUserDocument(iamUser, org, correlatedEmployee?.email));

      // Track AWS user to Okta user correlation
      if (iamUser.oktaUserId && iamUser.isFederated) {
        correlationMap.awsUserToOktaUser.set(iamUser.userName, iamUser.oktaUserId);
      }
    }

    // Generate documents for hosts as cloud instances
    for (const host of org.hosts) {
      documents.push(this.createHostAsCloudInstance(host, org));
    }

    documentsMap.set(this.dataStreams[0].index, documents);

    return documentsMap;
  }

  /**
   * Create a cloud resource document matching cloudbeat's AssetEvent structure
   */
  private createCloudResourceDocument(
    resource: CloudResource,
    _org: Organization
  ): CloudAssetDocument {
    const timestamp = this.getRandomTimestamp(48);

    const baseDoc: CloudAssetDocument = {
      '@timestamp': timestamp,
      event: {
        kind: 'asset',
      },
      cloud: {
        provider: resource.provider,
        region: resource.region,
        account: {
          id: resource.accountId,
          name: resource.accountName,
        },
        ...this.getProviderSpecificCloudFields(resource),
      },
      entity: {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        sub_type: resource.subType,
        source: resource.provider,
      },
      data_stream: {
        dataset: 'cloud_asset_inventory.asset_inventory',
        namespace: 'default',
        type: 'logs',
      },
      labels: resource.tags,
      tags: resource.tags ? Object.entries(resource.tags).map(([k, v]) => `${k}:${v}`) : undefined,
      related: {
        entity: [resource.id],
      },
    };

    return baseDoc;
  }

  /**
   * Create an IAM user document matching cloudbeat's AssetEvent structure
   */
  private createIamUserDocument(
    iamUser: CloudIamUser,
    org: Organization,
    correlatedEmail?: string
  ): CloudAssetDocument {
    const timestamp = this.getTimestamp();
    const account = org.cloudAccounts.find((a) => a.id === iamUser.accountId);

    // Map provider to cloudbeat's IAM user sub_type
    const iamSubTypeByProvider: Record<string, string> = {
      aws: 'AWS IAM User',
      gcp: 'GCP Service Account',
      azure: 'Azure Microsoft Entra ID User',
    };

    // Map provider to cloudbeat's IAM service name
    const iamServiceByProvider: Record<string, string> = {
      aws: 'AWS IAM',
      gcp: 'iam.googleapis.com/ServiceAccount',
      azure: 'Azure Entra',
    };

    return {
      '@timestamp': timestamp,
      event: {
        kind: 'asset',
      },
      cloud: {
        provider: iamUser.provider,
        region: 'global', // IAM is global
        account: {
          id: iamUser.accountId,
          name: account?.name || 'unknown',
        },
        service: {
          name: iamServiceByProvider[iamUser.provider] || 'IAM',
        },
      },
      entity: {
        id: iamUser.id,
        name: iamUser.userName,
        type: 'Identity',
        sub_type: iamSubTypeByProvider[iamUser.provider] || 'IAM User',
        source: iamUser.provider,
      },
      user: {
        id: iamUser.id,
        name: iamUser.userName,
        email: correlatedEmail,
      },
      data_stream: {
        dataset: 'cloud_asset_inventory.asset_inventory',
        namespace: 'default',
        type: 'logs',
      },
      tags: [
        iamUser.isFederated ? 'federated:true' : 'federated:false',
        iamUser.isFederated ? 'identity_provider:okta' : 'service_account:true',
        ...(correlatedEmail ? [`email:${correlatedEmail}`] : []),
      ],
      related: {
        entity: [iamUser.id],
      },
    };
  }

  /**
   * Create a cloud instance document from a host, matching cloudbeat's AssetEvent structure
   */
  private createHostAsCloudInstance(host: Host, org: Organization): CloudAssetDocument {
    const timestamp = this.getRandomTimestamp(24);
    const account = org.cloudAccounts.find((a) => a.provider === host.cloudProvider);

    const instanceTypeByProvider: Record<string, string[]> = {
      aws: ['t3.micro', 't3.small', 't3.medium', 'm5.large', 'm5.xlarge', 'c5.large', 'r5.large'],
      gcp: ['e2-micro', 'e2-small', 'e2-medium', 'n2-standard-2', 'n2-standard-4'],
      azure: ['Standard_B1s', 'Standard_B2s', 'Standard_D2s_v3', 'Standard_D4s_v3'],
    };

    const subTypeByProvider: Record<string, string> = {
      aws: 'AWS EC2 Instance',
      gcp: 'GCP Compute Instance',
      azure: 'Azure Virtual Machine',
    };

    const machineType = faker.helpers.arrayElement(
      instanceTypeByProvider[host.cloudProvider] || ['unknown']
    );

    return {
      '@timestamp': timestamp,
      event: {
        kind: 'asset',
      },
      cloud: {
        provider: host.cloudProvider,
        region: host.region,
        availability_zone: `${host.region}${faker.helpers.arrayElement(['a', 'b', 'c'])}`,
        account: {
          id: account?.id || 'unknown',
          name: account?.name || 'unknown',
        },
        instance: {
          id: host.id,
          name: host.name,
        },
        machine: {
          type: machineType,
        },
        service: {
          name: this.getComputeServiceName(host.cloudProvider),
        },
        ...(host.cloudProvider === 'gcp' && {
          project: {
            id: account?.id,
            name: account?.name,
          },
        }),
      },
      entity: {
        id: host.id,
        name: host.name,
        type: 'Host',
        sub_type: subTypeByProvider[host.cloudProvider],
        source: host.cloudProvider,
      },
      host: {
        id: host.id,
        name: host.name,
        architecture: 'x86_64',
        type: machineType,
        ip: faker.internet.ipv4(),
      },
      data_stream: {
        dataset: 'cloud_asset_inventory.asset_inventory',
        namespace: 'default',
        type: 'logs',
      },
      tags: [`purpose:${host.purpose}`, `os:${host.os.name}`, `type:${host.type}`],
      related: {
        entity: [host.id],
      },
    };
  }

  /**
   * Get provider-specific cloud fields
   */
  private getProviderSpecificCloudFields(
    resource: CloudResource
  ): Partial<CloudAssetDocument['cloud']> {
    const fields: Partial<CloudAssetDocument['cloud']> = {};

    switch (resource.provider) {
      case 'aws':
        fields.service = {
          name: this.getAwsServiceName(resource.subType),
        };
        if (resource.region !== 'us-east-1') {
          fields.availability_zone = `${resource.region}${faker.helpers.arrayElement(['a', 'b', 'c'])}`;
        }
        break;

      case 'gcp':
        fields.service = {
          name: this.getGcpServiceName(resource.subType),
        };
        fields.project = {
          id: resource.accountId,
          name: resource.accountName,
        };
        break;

      case 'azure':
        fields.service = {
          name: this.getAzureServiceName(resource.subType),
        };
        break;
    }

    return fields;
  }

  /**
   * Get AWS service name from subType
   * Values match cloudbeat's cloud.ServiceName (e.g., "AWS EC2", "AWS S3")
   */
  private getAwsServiceName(subType: string): string {
    const serviceMap: Record<string, string> = {
      'AWS EC2 Instance': 'AWS EC2',
      'AWS S3 Bucket': 'AWS S3',
      'AWS RDS Instance': 'AWS RDS',
      'AWS Lambda Function': 'AWS Lambda',
      'AWS Lambda Event Source Mapping': 'AWS Lambda',
      'AWS Lambda Layer': 'AWS Lambda',
      'AWS EKS Cluster': 'AWS EKS',
      'AWS EKS Node Group': 'AWS EKS',
      'AWS ECS Service': 'AWS ECS',
      'AWS DynamoDB Table': 'AWS DynamoDB',
      'AWS ElastiCache Cluster': 'AWS ElastiCache',
      'AWS VPC': 'AWS Networking',
      'AWS Elastic Load Balancer v2': 'AWS Networking',
      'AWS Elastic Load Balancer': 'AWS Networking',
      'AWS CloudFront Distribution': 'AWS CloudFront',
      'AWS IAM User': 'AWS IAM',
      'AWS IAM Role': 'AWS IAM',
      'AWS IAM Policy': 'AWS IAM',
      'AWS KMS Key': 'AWS KMS',
      'AWS SQS Queue': 'AWS SQS',
      'AWS SNS Topic': 'AWS SNS',
      'AWS EBS Volume': 'AWS EBS',
      'AWS EC2 Security Group': 'AWS Networking',
      'AWS EC2 Network Interface': 'AWS Networking',
      'AWS EC2 Subnet': 'AWS Networking',
      'AWS EC2 Network ACL': 'AWS Networking',
      'AWS VPC Peering Connection': 'AWS Networking',
      'AWS Internet Gateway': 'AWS Networking',
      'AWS NAT Gateway': 'AWS Networking',
      'AWS Transit Gateway': 'AWS Networking',
      'AWS Transit Gateway Attachment': 'AWS Networking',
    };
    return serviceMap[subType] || 'AWS';
  }

  /**
   * Get GCP service name from subType
   * Values match cloudbeat's cloud.ServiceName using GCP asset type format
   * (e.g., "compute.googleapis.com/Instance")
   */
  private getGcpServiceName(subType: string): string {
    const serviceMap: Record<string, string> = {
      'GCP Compute Instance': 'compute.googleapis.com/Instance',
      'GCP Bucket': 'storage.googleapis.com/Bucket',
      'GCP Cloud SQL Instance': 'sqladmin.googleapis.com/Instance',
      'GCP Cloud Function': 'cloudfunctions.googleapis.com/CloudFunction',
      'GCP Kubernetes Engine (GKE) Cluster': 'container.googleapis.com/Cluster',
      'GCP Cloud Run Service': 'run.googleapis.com/Service',
      'GCP Firestore Database': 'firestore.googleapis.com/Database',
      'GCP Bigtable Instance': 'bigtable.googleapis.com/Instance',
      'GCP VPC Network': 'compute.googleapis.com/Network',
      'GCP Load Balancing Forwarding Rule': 'compute.googleapis.com/ForwardingRule',
      'GCP Pub/Sub Topic': 'pubsub.googleapis.com/Topic',
      'GCP Firewall': 'compute.googleapis.com/Firewall',
      'GCP Subnet': 'compute.googleapis.com/Subnetwork',
      'GCP Service Account': 'iam.googleapis.com/ServiceAccount',
      'GCP Service Account Key': 'iam.googleapis.com/ServiceAccountKey',
      'GCP Organization': 'cloudresourcemanager.googleapis.com/Organization',
      'GCP Folder': 'cloudresourcemanager.googleapis.com/Folder',
      'GCP Project': 'cloudresourcemanager.googleapis.com/Project',
      'GCP IAM Role': 'iam.googleapis.com/Role',
    };
    return serviceMap[subType] || 'GCP';
  }

  /**
   * Get Azure service name from subType
   * Values match cloudbeat's cloud.ServiceName (e.g., "Azure Storage", "Azure Virtual Machines")
   */
  private getAzureServiceName(subType: string): string {
    const serviceMap: Record<string, string> = {
      'Azure Virtual Machine': 'Azure Virtual Machines',
      'Azure Storage Account': 'Azure Storage',
      'Azure Storage Blob Container': 'Azure Storage',
      'Azure Storage Blob Service': 'Azure Storage',
      'Azure Storage File Service': 'Azure Storage',
      'Azure Storage File Share': 'Azure Storage',
      'Azure Storage Queue': 'Azure Storage',
      'Azure Storage Queue Service': 'Azure Storage',
      'Azure Storage Table': 'Azure Storage',
      'Azure Storage Table Service': 'Azure Storage',
      'Azure SQL Database': 'Azure SQL',
      'Azure SQL Server': 'Azure SQL',
      'Azure Elastic Pool': 'Azure SQL',
      'Azure Function App': 'Azure Functions',
      'Azure AKS Cluster': 'Azure AKS',
      'Azure App Service': 'Azure App Services',
      'Azure Cosmos DB Account': 'Azure Cosmos DB',
      'Azure Cosmos DB SQL Database': 'Azure Cosmos DB',
      'Azure Cache for Redis': 'Azure Cache for Redis',
      'Azure Virtual Network': 'Azure Networking',
      'Azure Load Balancer': 'Azure Networking',
      'Azure Front Door': 'Azure Front Door',
      'Azure Service Bus Namespace': 'Azure Service Bus',
      'Azure Event Hub Namespace': 'Azure Event Hubs',
      'Azure Microsoft Entra ID User': 'Azure Entra',
      'Azure Microsoft Entra ID Group': 'Azure Entra',
      'Azure Principal': 'Azure Entra',
      'Azure Resource Group': 'Azure Entra',
      'Azure Subscription': 'Azure Entra',
      'Azure Tenant': 'Azure Entra',
      'Azure RoleDefinition': 'Azure Entra',
      'Azure Container Registry': 'Azure Container Registry',
      'Azure Disk': 'Azure Virtual Machines',
      'Azure Snapshot': 'Azure Virtual Machines',
    };
    return serviceMap[subType] || 'Azure';
  }

  /**
   * Get compute service name by provider
   * Values match cloudbeat's cloud.ServiceName for compute instances
   */
  private getComputeServiceName(provider: string): string {
    const serviceMap: Record<string, string> = {
      aws: 'AWS EC2',
      gcp: 'compute.googleapis.com/Instance',
      azure: 'Azure Virtual Machines',
    };
    return serviceMap[provider] || 'Compute';
  }
}
