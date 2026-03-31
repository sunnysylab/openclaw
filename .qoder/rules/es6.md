---
trigger: manual
alwaysApply: false
---

# ES Module (Node.js)

## General

- **Follow Best Practices**: Adhere to industry best practices and lean towards agile methodologies.
- **Prioritize Modularity, DRY, Performance, and Security**: Ensure code is modular, avoids repetition, performs well, and is secure.
- **Task Breakdown**: Break tasks into distinct, prioritized steps and follow them systematically.
- **Response Length**: Keep responses concise unless a verbosity level (Vx) is specified:
  - **V0**: Default, code golf (minimal code)
  - **V1**: Concise
  - **V2**: Simple
  - **V3**: Verbose, DRY with extracted functions

## Code

- **ES Module Syntax**: Use ES module syntax exclusively.
- **Refactoring Suggestions**: Suggest refactorings and code improvements where appropriate.
- **Latest Features**: Favor using the latest ES and Node.js features.
- **Error Handling**: Don’t apologize for errors; fix them. If unable to complete code, add `TODO:` comments.

## Comments

- **Clarity**: Add comments where the operation isn't clear from the code or where uncommon libraries are used.
- **File Path**: Start code with the path/filename as a one-line comment.
- **Purpose**: Comments should describe the purpose of the code, not just the effect.

## Example

```javascript
// src/utils/logger.js
import { createLogger, format, transports } from "winston";

const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console(), new transports.File({ filename: "logs/app.log" })],
});

export default logger;
```

This example demonstrates the use of ES module syntax, modularity, and clear commenting practices.
