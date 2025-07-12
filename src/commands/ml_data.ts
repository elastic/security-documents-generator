/**
 * ML Data Generation Commands
 * CLI interface for ML anomaly data generation
 * Migrated from Python anomaly-data-generator CLI
 */

import { MLDataGenerator, MLDataGenerationOptions } from '../ml/ml_data_generator';
import { ML_SECURITY_MODULES } from '../ml/types/ml_types';

export interface MLGenerationParams {
  jobIds?: string[];
  modules?: string[];
  enableJobs?: boolean;
  startDatafeeds?: boolean;
  deleteExisting?: boolean;
  namespace?: string;
  environment?: string;
  theme?: string;
  chunkSize?: number;
}

/**
 * Generate ML anomaly data for specific job IDs
 */
export async function generateMLData(params: MLGenerationParams): Promise<void> {
  const generator = new MLDataGenerator();
  
  if (!params.jobIds || params.jobIds.length === 0) {
    console.error('❌ No job IDs provided for ML data generation');
    return;
  }

  console.log('🤖 ML Anomaly Data Generation');
  console.log('='.repeat(50));
  console.log(`📊 Jobs: ${params.jobIds.join(', ')}`);
  console.log(`🎯 Namespace: ${params.namespace || 'default'}`);
  console.log(`⚙️ Enable Jobs: ${params.enableJobs ? 'Yes' : 'No'}`);
  console.log(`🚀 Start Datafeeds: ${params.startDatafeeds ? 'Yes' : 'No'}`);
  if (params.theme) {
    console.log(`🎨 Theme: ${params.theme}`);
  }
  console.log('');

  const options: MLDataGenerationOptions = {
    enableJobs: params.enableJobs,
    startDatafeeds: params.startDatafeeds,
    deleteExistingJobs: params.deleteExisting,
    namespace: params.namespace,
    theme: params.theme,
    environment: params.environment,
    bulkOptions: {
      chunkSize: params.chunkSize || 1000,
      refreshPolicy: 'true'
    }
  };

  try {
    const results = await generator.generateMLData(params.jobIds, options);
    
    // Summary
    console.log('\n📈 ML Data Generation Summary:');
    console.log('='.repeat(50));
    
    let totalDocs = 0;
    let totalAnomalies = 0;
    let successCount = 0;
    
    for (const result of results) {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.jobId}: ${result.documentsGenerated} docs, ${result.anomaliesGenerated} anomalies`);
      
      if (result.success) {
        totalDocs += result.documentsGenerated;
        totalAnomalies += result.anomaliesGenerated;
        successCount++;
      } else if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
    
    console.log('\n🎊 Final Results:');
    console.log(`  ✅ Successful jobs: ${successCount}/${results.length}`);
    console.log(`  📊 Total documents: ${totalDocs.toLocaleString()}`);
    console.log(`  🚨 Total anomalies: ${totalAnomalies.toLocaleString()}`);
    console.log(`  📈 Anomaly rate: ${((totalAnomalies / totalDocs) * 100).toFixed(3)}%`);
    
    if (params.enableJobs) {
      console.log('\n🔍 ML jobs have been created and enabled in Elasticsearch');
      console.log('   You can view them in Kibana → Machine Learning → Anomaly Detection');
    }

  } catch (error) {
    console.error('❌ ML data generation failed:', error);
    throw error;
  }
}

/**
 * Generate ML anomaly data for security modules
 */
export async function generateMLDataForModules(params: MLGenerationParams): Promise<void> {
  const generator = new MLDataGenerator();
  
  if (!params.modules || params.modules.length === 0) {
    console.error('❌ No security modules provided for ML data generation');
    return;
  }

  // Validate modules
  const validModules = ML_SECURITY_MODULES.map(m => m.name);
  const invalidModules = params.modules.filter(m => !validModules.includes(m));
  
  if (invalidModules.length > 0) {
    console.error(`❌ Invalid security modules: ${invalidModules.join(', ')}`);
    console.error(`   Valid modules: ${validModules.join(', ')}`);
    return;
  }

  console.log('🤖 ML Anomaly Data Generation by Modules');
  console.log('='.repeat(50));
  console.log(`📦 Modules: ${params.modules.join(', ')}`);
  console.log(`🎯 Namespace: ${params.namespace || 'default'}`);
  console.log(`⚙️ Enable Jobs: ${params.enableJobs ? 'Yes' : 'No'}`);
  console.log(`🚀 Start Datafeeds: ${params.startDatafeeds ? 'Yes' : 'No'}`);
  if (params.theme) {
    console.log(`🎨 Theme: ${params.theme}`);
  }
  
  // Show jobs per module
  console.log('\n📋 Jobs by Module:');
  for (const moduleName of params.modules) {
    const module = ML_SECURITY_MODULES.find(m => m.name === moduleName);
    if (module) {
      console.log(`  📦 ${moduleName}: ${module.jobs.length} jobs`);
      console.log(`     ${module.jobs.join(', ')}`);
    }
  }
  console.log('');

  const options: MLDataGenerationOptions = {
    enableJobs: params.enableJobs,
    startDatafeeds: params.startDatafeeds,
    deleteExistingJobs: params.deleteExisting,
    namespace: params.namespace,
    theme: params.theme,
    environment: params.environment,
    bulkOptions: {
      chunkSize: params.chunkSize || 1000,
      refreshPolicy: 'true'
    }
  };

  try {
    const results = await generator.generateMLDataForModules(params.modules, options);
    
    // Summary by module
    console.log('\n📈 ML Data Generation Summary by Module:');
    console.log('='.repeat(60));
    
    for (const moduleName of params.modules) {
      const module = ML_SECURITY_MODULES.find(m => m.name === moduleName);
      if (!module) continue;
      
      console.log(`\n📦 ${moduleName}:`);
      
      let moduleSuccess = 0;
      let moduleDocs = 0;
      let moduleAnomalies = 0;
      
      for (const jobId of module.jobs) {
        const result = results.find(r => r.jobId === jobId);
        if (result) {
          const status = result.success ? '✅' : '❌';
          console.log(`  ${status} ${result.jobId}: ${result.documentsGenerated} docs, ${result.anomaliesGenerated} anomalies`);
          
          if (result.success) {
            moduleSuccess++;
            moduleDocs += result.documentsGenerated;
            moduleAnomalies += result.anomaliesGenerated;
          }
        }
      }
      
      console.log(`  📊 Module Total: ${moduleSuccess}/${module.jobs.length} jobs, ${moduleDocs} docs, ${moduleAnomalies} anomalies`);
    }
    
    // Overall summary
    const totalSuccess = results.filter(r => r.success).length;
    const totalDocs = results.reduce((sum, r) => sum + (r.success ? r.documentsGenerated : 0), 0);
    const totalAnomalies = results.reduce((sum, r) => sum + (r.success ? r.anomaliesGenerated : 0), 0);
    
    console.log('\n🎊 Overall Results:');
    console.log(`  ✅ Successful jobs: ${totalSuccess}/${results.length}`);
    console.log(`  📊 Total documents: ${totalDocs.toLocaleString()}`);
    console.log(`  🚨 Total anomalies: ${totalAnomalies.toLocaleString()}`);
    console.log(`  📈 Anomaly rate: ${((totalAnomalies / totalDocs) * 100).toFixed(3)}%`);

  } catch (error) {
    console.error('❌ ML data generation for modules failed:', error);
    throw error;
  }
}

/**
 * Delete ML data and jobs
 */
export async function deleteMLData(params: MLGenerationParams): Promise<void> {
  const generator = new MLDataGenerator();
  
  if (!params.jobIds || params.jobIds.length === 0) {
    console.error('❌ No job IDs provided for ML data deletion');
    return;
  }

  console.log('🗑️ ML Data Deletion');
  console.log('='.repeat(30));
  console.log(`📊 Jobs: ${params.jobIds.join(', ')}`);
  console.log(`🎯 Namespace: ${params.namespace || 'default'}`);
  console.log('');

  const options: MLDataGenerationOptions = {
    namespace: params.namespace,
    environment: params.environment
  };

  try {
    await generator.deleteMLData(params.jobIds, options);
    console.log('✅ ML data deletion completed');

  } catch (error) {
    console.error('❌ ML data deletion failed:', error);
    throw error;
  }
}

/**
 * List available ML jobs and modules
 */
export function listMLJobs(): void {
  const generator = new MLDataGenerator();
  
  console.log('🤖 Available ML Jobs and Security Modules');
  console.log('='.repeat(50));
  
  const modules = generator.getAvailableModules();
  let totalJobs = 0;
  
  for (const module of modules) {
    console.log(`\n📦 ${module.name} (${module.jobs.length} jobs):`);
    for (const job of module.jobs) {
      console.log(`  • ${job}`);
      totalJobs++;
    }
  }
  
  console.log(`\n📊 Total: ${modules.length} modules, ${totalJobs} ML jobs`);
  
  console.log('\n💡 Usage Examples:');
  console.log('  # Generate data for specific jobs:');
  console.log('  yarn start generate-ml-data --jobs auth_rare_user,linux_rare_sudo_user');
  console.log('');
  console.log('  # Generate data for entire modules:');
  console.log('  yarn start generate-ml-data --modules security_auth,security_linux');
  console.log('');
  console.log('  # Generate with ML jobs enabled:');
  console.log('  yarn start generate-ml-data --modules security_auth --enable-jobs');
}