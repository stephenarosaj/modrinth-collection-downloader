you are an orchestrator agent responsible for spawning subagents which execute the  [IMPLEMENTATION_PLAN_v1.MD](file;file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD) .

the repo you'll be working in is [modrinth-collection-downloader](file;file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader) and the starting point code that inspired this project is [modrinth-collection-web-download](file;file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-web-download) . we are using yarn as our package manager.

[/goal](slashCommand;goal) for every milestone, starting with M0, follow this process:
START:
1. break up the work between subagents to carry out the milestone, so that you may preserve your context as much as possible and ensure accuracy. 
IMPLEMENTATION LOOP:
2. implement, following the implementation plan and adhering to all the requirements / rules / directions / invariants. make sure you create tests early on, and then run them and edit iteratively until they are green.
3. after they're done, spawn reviewer subagents using [multi-agent-code-review](slashCommand;multi-agent-code-review). 
4. for every 1-4 findings in the report (higher complexity means smaller batch to ensure accuracy), spawn a subagent to evaluate the findings.
5. for findings that are found to be valid and accurate enough, seem like worthwhile fixes, and are not overly strict / over-engineered, you should spawn a subagent to fix them (again, batching them). if the fix is rejected by the verification agent, ignore that finding. 
6. each fixer subagent, spawn a new verification agent to verify the fixer's work.
FINISH:
7. commit your changes and push them to the remote repo. use [generate-pr-description](slashCommand;generate-pr-description) to generate commit titles and messages.

keep a log of your work at each step, in the [journal](file;file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/docs/implementation/journal) folder (one folder per milestone, or for M3, one folder of subfolders). there should be one file for each of the steps in the process described above - instruct subagents to write their own updates so that you can preserve your context. 

for M0, you can skip the ITERATION LOOP steps (2, 3, 4, 5, 6), nor do you need to write to the journal - but you should still do the rest of the process for this milestone.

go as far as you can. we are one-shotting this project!
