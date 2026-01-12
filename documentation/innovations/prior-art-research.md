# Prior Art Research: Semantic Code Graphs & LLM Context Assembly

**Research Date:** January 11, 2026  
**Topics:** Semantic code graphs, LLM context assembly, code intelligence, software engineering + ML

---

## Executive Summary

This document compiles research on semantic code analysis, context assembly for LLMs, and related technologies across academic papers, patents, and industry developments. The field is rapidly evolving with significant contributions from both academia and major tech companies.

---

## 1. Academic Papers

### 1.1 Code Analysis & Machine Learning

#### **"A Systematic Literature Review on the Use of Machine Learning in Software Engineering"**
- **Source:** arXiv (2024)
- **Link:** https://arxiv.org/abs/2406.13877
- **Key Topics:** Software quality assurance, maintenance, comprehension, documentation
- **Techniques:** Supervised learning, unsupervised learning, deep learning
- **Relevance:** Comprehensive overview of ML applications in software engineering domains

#### **"A Large-Scale Study of Model Integration in ML-Enabled Software Systems"**
- **Source:** arXiv (2024)
- **Link:** https://arxiv.org/abs/2408.06226
- **Scope:** Analysis of 2,900+ open-source systems
- **Focus:** ML model integration practices, bridging data science and software engineering
- **Key Insights:** Characteristics and practices of embedding ML models into traditional software

#### **"A Software Engineering Perspective on Engineering Machine Learning Systems"**
- **Source:** arXiv (2020)
- **Link:** https://arxiv.org/abs/2012.07919
- **Author:** Görkem Giray
- **Key Points:** 
  - Challenges of non-deterministic ML systems
  - Need for new tools and testing methodologies
  - Software engineering complexities in ML systems

#### **"Software Engineering for AI and Machine Learning Software: Systematic Literature Review"**
- **Source:** arXiv (2020)
- **Link:** https://arxiv.org/abs/2011.03751
- **Focus:** SE practices in AI/ML development
- **Contributions:** Challenges identification and proposed solutions

### 1.2 Code Vulnerability & Security

#### **"Ensemble Multi-Label Machine Learning Solidity Smart Contract Vulnerability Detection Model"**
- **Source:** Springer (2025)
- **Link:** https://link.springer.com/article/10.1007/s10586-025-05725-y
- **Innovation:** Transforms bytecode emphasizing control and data flow patterns
- **Method:** Retains opcode mnemonics, discards operand values for better generalization
- **Application:** Smart contract vulnerability detection

#### **"MalBERTv2: Code Aware BERT-Based Model for Malware Identification"**
- **Source:** MDPI (2024)
- **Link:** https://www.mdpi.com/2504-2289/7/2/60
- **Approach:** BERT-based model for code analysis
- **Features:** Custom tokenizer, Byte-Pair Encoding (BPE)
- **Application:** Malware detection through code semantics

### 1.3 Code Understanding & RAG Limitations

#### **"Why RAG Retrieval Fails for Microservices Code Review at Scale"**
- **Source:** CodeAnt.ai Blog (2025)
- **Link:** https://www.codeant.ai/blogs/rag-retrieval-fails-microservices-code-review
- **Key Findings:**
  - RAG struggles with distributed systems
  - Complex queries across service boundaries
  - Data inconsistencies
  - Hallucinations in code analysis
  - Need for LLMs with deep architectural understanding

### 1.4 Compiler & Language Theory

#### **"BurTorch: Revisiting Training from First Principles"**
- **Source:** KAUST Repository
- **Link:** https://repository.kaust.edu.sa/bitstreams/0997f91f-441a-4f16-9003-3e33e729134e/download
- **Focus:** Compiler-based approaches in ML
- **Topics:** Semantic analysis, code optimization

#### **"Development, Assessment, and Reengineering of Language Descriptions"**
- **Source:** VU Amsterdam
- **Link:** https://www.cs.vu.nl/~x/cale/cale.html
- **Method:** BNF parsers for language description analysis
- **Goal:** Identify and correct semantic errors in language definitions

---

## 2. Patents & Proprietary Technologies

### 2.1 Graph-Based Systems

#### **"Graph-Augmented RAG for Telecom"** (Ericsson)
- **Source:** Ericsson Initiative
- **Link:** https://fr.linkedin.com/jobs/view/graph-augmented-rag-for-telecom-at-ericsson-4344930017
- **Innovation:** Incorporates graph structures into RAG
- **Benefits:**
  - Preserves document hierarchies
  - Handles inter-referenced documentation
  - Improves factual accuracy
  - Enhanced reasoning depth

### 2.2 Security Systems

#### **"HOLMES: A System for Detecting Advanced and Persistent Threats"**
- **Source:** IEEE Security & Privacy 2019
- **Link:** https://www.ieee-security.org/TC/SP2019/program-papers.html
- **Approach:** Correlates suspicious information flows
- **Features:**
  - High-level graph generation
  - Real-time attacker action summarization
  - APT campaign detection

### 2.3 Patent Search Recommendations
- **Google Patents:** Search for "semantic code analysis" and "context assembly"
- **USPTO:** Combine keywords: software + semantic + graph

---

## 3. Industry Implementations

### 3.1 Cody AI (Sourcegraph)

#### **"Deep Codebase Understanding, Real-World Applications, and Strategic Market Positioning"**
- **Source:** MGX.dev Insights
- **Link:** https://mgx.dev/insights/c4dc216669bf47a4b91e6e1e103a57cd
- **Key Technology:** Repo-level Semantic Graph (RSG)
- **Features:**
  - Sophisticated context engine
  - Maintains deep codebase understanding
  - Graph expansion algorithms
  - Link prediction on RSG
  - Multi-source context retrieval (local code, docs, etc.)
  - Token usage optimization
  - Prevents truncated responses

**System Architecture:**
1. **Retrieval Phase:** Gather context from multiple sources
2. **Ranking Phase:** Prioritize most relevant context
3. **Graph Operations:** Expansion and link prediction

### 3.2 Microsoft Research

#### **"Software Engineering for Machine Learning: A Case Study"**
- **Source:** Microsoft Research
- **Link:** https://www.microsoft.com/en-us/research/publication/software-engineering-for-machine-learning-a-case-study/
- **Contribution:** Nine-stage workflow for AI-based applications
- **Focus:** Evolution of development processes for AI capabilities
- **Insights:** Practical approaches to integrating ML into software

### 3.3 Snyk

#### **"Context Engineering: Building Intelligent AI Systems Through Strategic Information Management"**
- **Source:** Snyk Blog
- **Link:** https://snyk.io/articles/context-engineering/
- **Principles:**
  - **Semantic similarity** optimization
  - **Information density** optimization
  - **Temporal relationship** preservation
  - **Context relevance** maximization
- **Implementation Methods:**
  - Adaptive retrieval systems
  - Bayesian inference frameworks
  - Strategic context selection

### 3.4 Practical Implementation

#### **"Building my first AI project: From Zero to 'Production' ready RAG"**
- **Source:** Medium (2025)
- **Author:** Sandeep G
- **Link:** https://medium.com/@sandeepg2890/building-my-first-ai-service-from-zero-to-production-rag-in-2025-08d1b370640b
- **Focus:** Custom RAG pipeline for code analysis
- **Challenges:** Legacy codebase complexity
- **Solutions:** Context engineering, specialized parsing

---

## 4. Research Institutions & Educational Resources

### 4.1 Carnegie Mellon University - SEI

#### **"Applied Machine Learning in Software Engineering"**
- **Source:** Software Engineering Institute
- **Link:** https://insights.sei.cmu.edu/library/applied-machine-learning-in-software-engineering/
- **Topics:** Immediate benefits and considerations for ML in SE
- **Focus:** Alignment of data scientists, software engineers, and operations

#### **"Software Engineering for Machine Learning" (Podcast)**
- **Source:** SEI
- **Link:** https://www.sei.cmu.edu/library/software-engineering-for-machine-learning/
- **Content:** Integration of ML into SE practices

### 4.2 Cornell University

#### **"Software Engineering in the Era of Machine Learning"**
- **Source:** CS 6158 Course
- **Link:** https://www.cs.cornell.edu/courses/cs6158/2024fa/
- **Topics:**
  - Testing and debugging ML systems
  - Program analysis for ML
  - Using ML to improve SE
  - Research at SE/ML intersection

### 4.3 Imperial College London

#### **"Software Engineering for Machine Learning Systems"**
- **Source:** Course by Andrew Eland
- **Link:** https://www.andreweland.org/swemls/
- **Content:**
  - Building robust ML systems
  - Practical projects (medical prediction models, clinical alerts)
  - Engineering concepts for ML operations

---

## 5. Tools & Frameworks

### 5.1 Apache SystemDS
- **Status:** Open-source ML system
- **Former Name:** Apache SystemML
- **Features:**
  - End-to-end data science lifecycle support
  - R-like and Python-like languages
  - Multiple execution modes (standalone, distributed)
  - Algorithm customizability
- **Link:** https://en.wikipedia.org/wiki/Apache_SystemDS

### 5.2 MLIR (Multi-Level Intermediate Representation)
- **Developer:** Google
- **Purpose:** Compiler infrastructure for ML
- **Benefits:**
  - Improved modularity
  - Better maintainability
  - Multi-level IR support
  - Gradual lowering through transformations
  - Custom operations and type systems
- **Link:** https://en.wikipedia.org/wiki/MLIR_(software)

---

## 6. Key Concepts & Methodologies

### 6.1 MLOps
- **Definition:** Combination of ML + DevOps
- **Scope:** Entire ML lifecycle
- **Components:**
  - Integration
  - Deployment
  - Monitoring
  - Governance
- **Goal:** Robust, scalable, efficient ML systems
- **Link:** https://en.wikipedia.org/wiki/MLOps

### 6.2 Context Engineering Principles

From multiple sources, key principles include:

1. **Semantic Similarity**
   - Match query intent to code semantics
   - Use embeddings for similarity matching

2. **Information Density Optimization**
   - Maximize relevant information per token
   - Minimize noise in context

3. **Temporal Relationship Preservation**
   - Maintain code evolution history
   - Track dependency changes over time

4. **Adaptive Retrieval**
   - Dynamic context selection
   - Query-specific retrieval strategies

5. **Graph-Based Relationships**
   - Leverage code structure
   - Use dependency graphs
   - Enable graph traversal for context

---

## 7. Challenges Identified

### 7.1 RAG Limitations in Code Analysis
- **Complex queries** across service boundaries
- **Inconsistent data** in distributed systems
- **Hallucinations** when context is incomplete
- **Microservices architecture** breaks RAG assumptions
- **Token limitations** with large codebases

### 7.2 ML/SE Integration Challenges
- **Non-determinism** in ML systems
- **Testing difficulties** for ML components
- **Versioning** of ML models and data
- **Reproducibility** concerns
- **Cross-team alignment** (data scientists, engineers, ops)

### 7.3 Semantic Code Analysis Challenges
- **Scale** - handling large codebases
- **Multi-language** support
- **Cross-file dependencies**
- **Dynamic behavior** vs static analysis
- **Context window limitations**

---

## 8. Recommended Conference Sources

### 8.1 Strange Loop
- Focus: Software engineering practices
- Topics: Programming languages, distributed systems, security

### 8.2 QCon
- Focus: Enterprise software development
- Topics: Architecture, ML/AI, DevOps, cloud

### 8.3 Other Relevant Conferences
- **ICSE** (International Conference on Software Engineering)
- **FSE** (Foundations of Software Engineering)
- **ASE** (Automated Software Engineering)
- **ISSTA** (International Symposium on Software Testing and Analysis)

---

## 9. Search Queries for Further Research

### 9.1 Google Scholar
```
"semantic code graph" "LLM context assembly"
"code intelligence" "graph-based code analysis"
"repository semantic graph"
"code embedding" "semantic search"
"program dependence graph" "LLM"
```

### 9.2 arXiv (cs.SE)
```
semantic code analysis
code graph neural networks
program analysis machine learning
code context retrieval
```

### 9.3 ACM Digital Library
```
software engineering AND machine learning
code comprehension AND deep learning
semantic code search
program analysis AND transformers
```

### 9.4 Google Patents / USPTO
```
semantic code analysis
context assembly software
code graph analysis
program dependence graph
code intelligence system
```

---

## 10. Related Technologies & Terms

### 10.1 Static Analysis
- **AST** (Abstract Syntax Tree)
- **CFG** (Control Flow Graph)
- **PDG** (Program Dependence Graph)
- **Call graphs**
- **Data flow analysis**

### 10.2 Code Intelligence
- **Code2Vec** - code embeddings
- **GraphCodeBERT** - graph-enhanced code understanding
- **CodeBERT** - pre-trained models for code
- **UniXcoder** - unified cross-modal code representation

### 10.3 Retrieval & Search
- **RAG** (Retrieval-Augmented Generation)
- **Semantic search**
- **Vector databases**
- **Embedding models**
- **Hybrid search** (keyword + semantic)

---

## 11. Industry Players

### 11.1 Major Companies
- **GitHub** (Copilot, CodeQL)
- **Microsoft** (IntelliCode, Pylance)
- **Google** (Code Search, AI assistance)
- **JetBrains** (AI Assistant)
- **Amazon** (CodeWhisperer)

### 11.2 Startups & Specialized Tools
- **Sourcegraph** (Cody AI, code search)
- **Tabnine** (AI code completion)
- **Codeium** (AI-powered toolkit)
- **CodeAnt.ai** (Code review)
- **Snyk** (Security with AI)

---

## 12. Key Takeaways for STE Runtime

### 12.1 Differentiation Opportunities
1. **Multi-language semantic graph** - comprehensive language support
2. **Incremental reconciliation** - efficient updates vs full rebuilds
3. **Hybrid approach** - combining static analysis + semantic understanding
4. **Change detection** - sophisticated file watching and delta analysis
5. **Validation framework** - ensuring graph consistency

### 12.2 Alignment with Industry
- **Semantic graph approach** aligns with Cody AI's RSG
- **Context assembly** similar to retrieval/ranking pipelines
- **Graph traversal** for context gathering is industry standard
- **Incremental updates** address scalability concerns

### 12.3 Novel Contributions
- **Change-aware reconciliation** (incremental recon approach)
- **Multi-phase recon** (discovery → parse → resolve → link → finalize)
- **STE format specification** (standardized interchange format)
- **Language-agnostic framework** with extensible extractors

### 12.4 Research Gaps to Explore
1. How others handle **partial graph updates**
2. **Validation strategies** for graph consistency
3. **Performance benchmarks** for large-scale codebases
4. **Context selection algorithms** for LLM consumption

---

## 13. Next Steps

### 13.1 Deep Dives Needed
- [ ] Read full papers on code embeddings (code2vec, CodeBERT)
- [ ] Study graph neural networks for code
- [ ] Analyze Sourcegraph's RSG architecture (if public docs available)
- [ ] Research program dependence graphs in detail

### 13.2 Patent Research
- [ ] Conduct USPTO search for specific patents
- [ ] Review Google Patents for code graph technologies
- [ ] Identify potential IP conflicts or prior art

### 13.3 Conference Proceedings
- [ ] Search QCon 2024-2026 for relevant talks
- [ ] Look for Strange Loop presentations on code analysis
- [ ] Review ICSE/FSE proceedings for semantic analysis papers

### 13.4 Industry Engagement
- [ ] Subscribe to GitHub Engineering blog
- [ ] Follow JetBrains Research publications
- [ ] Monitor Microsoft Research for code intelligence papers
- [ ] Track Sourcegraph's technical blog updates

---

## References

All links and sources are embedded throughout this document. For the most current information, regularly search:
- arXiv cs.SE: https://arxiv.org/list/cs.SE/recent
- ACM Digital Library: https://dl.acm.org/
- Google Scholar: https://scholar.google.com/
- Google Patents: https://patents.google.com/
- USPTO: https://www.uspto.gov/

---

**Document Maintained By:** STE Runtime Project  
**Last Updated:** January 11, 2026  
**Status:** Living document - update as new research emerges



