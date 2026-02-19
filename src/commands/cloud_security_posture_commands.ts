import type { Command } from 'commander';
import { generateCloudSecurityPosture, resolveDataSources } from './cloud_security_posture';

const parseIntBase10 = (input: string) => parseInt(input, 10);

export function registerCloudSecurityPostureCommand(program: Command): void {
  program
    .command('generate-cloud-security-posture')
    .alias('csp')
    .description(
      'Generate Cloud Security Posture data (misconfigurations, vulnerabilities, csp_scores)\n\n' +
        '  Data sources:\n' +
        '    Shortcuts: all, elastic_all\n' +
        '    Elastic:   elastic_cspm_aws, elastic_cspm_gcp, elastic_cspm_azure,\n' +
        '              elastic_kspm_vanilla, elastic_kspm_eks, elastic_cnvm\n' +
        '    3rd party: wiz_misconfigs, wiz_vulnerabilities, qualys_vulnerabilities,\n' +
        '              tenable_vulnerabilities, aws_misconfigs'
    )
    .option('--seed <seed>', 'Random seed for reproducibility', parseIntBase10)
    .option('--data-sources <list>', 'Comma-separated data sources (see above)', 'all')
    .option('--findings-count <n>', 'Number of findings per data source', parseIntBase10, 50)
    .option(
      '--csp-scores',
      'Generate historical CSP scores trend data (requires Kibana CSP plugin setup)',
      false
    )
    .action(
      async (options: {
        seed?: number;
        dataSources: string;
        findingsCount: number;
        cspScores: boolean;
      }) => {
        const dataSources = resolveDataSources(
          options.dataSources
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        );

        await generateCloudSecurityPosture({
          seed: options.seed,
          dataSources,
          findingsCount: options.findingsCount,
          generateCspScores: options.cspScores,
        });
      }
    );
}
