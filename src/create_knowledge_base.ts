import {
  generateMultipleKnowledgeBaseDocuments,
  generateKnowledgeBaseDocument,
} from './generators/knowledge_base_generator';
import { indexCheck, ingest } from './commands/utils/indices';
import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import knowledgeBaseMappings from './mappings/knowledgeBaseMappings.json';

export interface KnowledgeBaseOptions {
  count: number;
  includeMitre?: boolean;
  namespace?: string;
  space?: string;
  categories?: string[];
  accessLevel?: 'public' | 'team' | 'organization' | 'restricted';
  confidenceThreshold?: number;
}

function getKnowledgeBaseIndexName(
  namespace: string = 'default',
  space: string = 'default',
): string {
  if (space === 'default') {
    return `knowledge-base-security-${namespace}`;
  }
  return `knowledge-base-security-${space}-${namespace}`;
}

export async function createKnowledgeBaseDocuments(
  options: KnowledgeBaseOptions,
): Promise<void> {
  const {
    count,
    includeMitre = false,
    namespace = 'default',
    space = 'default',
    categories = [],
    accessLevel,
    confidenceThreshold = 0.0,
  } = options;

  console.log(`\n🧠 Generating ${count} Knowledge Base documents...`);
  console.log(
    `📚 Categories: ${categories.length > 0 ? categories.join(', ') : 'all'}`,
  );
  console.log(`🔐 Access Level: ${accessLevel || 'mixed'}`);
  console.log(
    `🎯 MITRE ATT&CK Integration: ${includeMitre ? 'enabled' : 'disabled'}`,
  );

  // Generate knowledge base documents
  let documents = generateMultipleKnowledgeBaseDocuments(count, includeMitre);

  // Filter by categories if specified - apply during generation instead of after
  if (categories.length > 0) {
    // Regenerate documents with only specified categories
    documents = [];
    const docsPerCategory = Math.ceil(count / categories.length);

    for (const category of categories) {
      for (let i = 0; i < docsPerCategory && documents.length < count; i++) {
        let doc = generateKnowledgeBaseDocument(includeMitre);
        // Ensure the document matches the desired category
        let attempts = 0;
        while (doc.category !== category && attempts < 10) {
          doc = generateKnowledgeBaseDocument(includeMitre);
          attempts++;
        }
        if (doc.category === category || attempts >= 10) {
          documents.push(doc);
        }
      }
    }
  }

  // Filter by access level if specified
  if (accessLevel) {
    documents = documents.filter((doc) => doc.access_level === accessLevel);
  }

  // Filter by confidence threshold
  if (confidenceThreshold > 0) {
    documents = documents.filter(
      (doc) => doc.confidence >= confidenceThreshold,
    );
  }

  if (documents.length === 0) {
    console.log('⚠️  No documents match the specified filters');
    return;
  }

  // Determine index name
  const indexName = getKnowledgeBaseIndexName(namespace, space);

  // Create index with knowledge base mappings
  await indexCheck(indexName, {
    mappings: knowledgeBaseMappings as MappingTypeMapping,
    settings: {
      'index.mapping.total_fields.limit': 10000,
      'index.mapping.nested_fields.limit': 1000,
      'index.mapping.nested_objects.limit': 10000,
    },
  });

  // Ingest documents
  await ingest(indexName, documents);

  // Display summary with titles
  console.log(
    `\n✅ Successfully created ${documents.length} Knowledge Base documents in index: ${indexName}`,
  );
  console.log('\n📋 Generated Knowledge Base Documents:');

  documents.forEach((doc, index) => {
    const {
      title,
      category,
      subcategory,
      confidence,
      access_level,
      suggested_questions,
    } = doc;
    const confidenceIcon =
      confidence >= 0.9
        ? '🔥'
        : confidence >= 0.8
          ? '✅'
          : confidence >= 0.7
            ? '⚡'
            : '📝';
    const accessIcon =
      access_level === 'public'
        ? '🌍'
        : access_level === 'team'
          ? '👥'
          : access_level === 'organization'
            ? '🏢'
            : '🔒';

    console.log(
      `  ${index + 1}. ${confidenceIcon} ${accessIcon} [${category}/${subcategory}] ${title}`,
    );

    // Display suggested questions for AI assistant
    if (suggested_questions && suggested_questions.length > 0) {
      console.log(`     💬 Suggested AI Assistant Questions:`);
      suggested_questions.slice(0, 3).forEach((question, qIndex) => {
        console.log(`        ${qIndex + 1}. ${question}`);
      });
      if (suggested_questions.length > 3) {
        console.log(
          `        ... and ${suggested_questions.length - 3} more questions`,
        );
      }
    }
  });

  // Show category breakdown
  const categoryBreakdown = documents.reduce(
    (acc, doc) => {
      const key = `${doc.category}/${doc.subcategory}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('\n📊 Category Breakdown:');
  Object.entries(categoryBreakdown).forEach(([key, count]) => {
    console.log(`  • ${key}: ${count} documents`);
  });

  // Show access level distribution
  const accessBreakdown = documents.reduce(
    (acc, doc) => {
      acc[doc.access_level] = (acc[doc.access_level] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('\n🔐 Access Level Distribution:');
  Object.entries(accessBreakdown).forEach(([level, count]) => {
    const icon =
      level === 'public'
        ? '🌍'
        : level === 'team'
          ? '👥'
          : level === 'organization'
            ? '🏢'
            : '🔒';
    console.log(`  ${icon} ${level}: ${count} documents`);
  });

  // Show MITRE integration if enabled
  if (includeMitre) {
    const mitreDocuments = documents.filter((doc) => doc.mitre);
    console.log(
      `\n🎯 MITRE ATT&CK Integration: ${mitreDocuments.length}/${documents.length} documents`,
    );

    const allTechniques = mitreDocuments.flatMap(
      (doc) => doc.mitre?.technique_ids || [],
    );
    const uniqueTechniques = [...new Set(allTechniques)];
    console.log(`  • Techniques covered: ${uniqueTechniques.length}`);
  }

  console.log(`\n🔍 Query in Kibana: index:"${indexName}"`);
  console.log(
    `🧠 AI Assistant: Documents are ready for knowledge base integration`,
  );
}
