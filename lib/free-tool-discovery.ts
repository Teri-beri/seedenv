import { freeTools, type FreeTool } from "@/lib/organic-growth";
import { SITE_URL } from "@/lib/seo";

export function freeToolFaqs(tool?: FreeTool) {
  return [
    {
      question: tool ? `Is SeedEnv ${tool.name} free to use without logging in?` : "Are SeedEnv's developer tools free without an account?",
      answer: "Yes. Open the tool and use its free utility without signing in or entering a credit card. Launching a paid human-testing sprint is a separate, optional flow that requires an account and funding.",
    },
    ...(tool ? [
      { question: `What do I enter into ${tool.name}?`, answer: tool.input },
      { question: `What results does ${tool.name} produce?`, answer: tool.output },
      { question: `What are the limitations of ${tool.name}?`, answer: tool.limitation },
    ] : [
      { question: "Which free developer tools does SeedEnv offer?", answer: freeTools.map((item) => `${item.name}: ${item.description}`).join(" ") },
      { question: "Do these tools replace testing on real devices?", answer: "No. Viewport Check is a sandboxed preview, QA Checklist is a manual testing plan, and SwarmForensics reports heuristic signals. They do not certify a release or replace human testing." },
    ]),
  ];
}

export function freeToolStructuredData(tool?: FreeTool) {
  const path = tool?.path || "/tools";
  const tools = tool ? [tool] : freeTools;
  return {
    "@context": "https://schema.org",
    "@graph": [
      ...tools.map((item) => ({
        "@type": "WebApplication",
        "@id": `${SITE_URL}${item.path}#application`,
        name: `SeedEnv ${item.name}`,
        url: `${SITE_URL}${item.path}`,
        description: item.description,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript and a modern web browser.",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [item.input, item.output, item.limitation],
        publisher: { "@id": `${SITE_URL}/#organization` },
      })),
      ...(!tool ? [{
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/tools#collection`,
        url: `${SITE_URL}/tools`,
        name: "SeedEnv free developer tools",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: freeTools.map((item, index) => ({
            "@type": "ListItem", position: index + 1,
            name: item.name, url: `${SITE_URL}${item.path}`,
          })),
        },
      }] : []),
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}${path}#faq`,
        mainEntity: freeToolFaqs(tool).map(({ question, answer }) => ({
          "@type": "Question", name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };
}

export function freeToolsGuide() {
  return [
    "# SeedEnv",
    "",
    "> SeedEnv offers public, free developer utilities and a separate paid crowdsourced QA marketplace.",
    "",
    "## Free developer tools",
    "",
    `- [Tool directory](${SITE_URL}/tools): No login or credit card is required for the free utilities.`,
    ...freeTools.flatMap((tool) => [
      "",
      `### [${tool.name}](${SITE_URL}${tool.path})`,
      tool.description,
      `Input: ${tool.input}`,
      `Output: ${tool.output}`,
      `Limitations: ${tool.limitation}`,
    ]),
    "",
    "## Human testing",
    "",
    `- [Pricing](${SITE_URL}/pricing): Human-testing cohorts are separate paid services; an account and funding are required.`,
    `- [Testing guides](${SITE_URL}/guides): Practical guidance for beta testing and release readiness.`,
    `- [Privacy](${SITE_URL}/privacy): Data handling and analytics policy.`,
    "",
  ].join("\n");
}
