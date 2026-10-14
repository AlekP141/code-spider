[] Find a way to show the dataflow between two points. You should be able to select 2 pieces of code and select to display all the steps inbetween. This should pull up Code Spider with a bold blue outline to display the path. Importantly, this should not show only the fastest route through the code between two points, but all routes. E.g. if you select a piece of data and then a frontend page renderer - it should show if the path to the same page diverges at any point as various parts of the data are handled differently. 

Would this be done using DFS?

[] Test files should be displayed differently - either with opacuity lower or dotted line or enable the ability to hide functions within a test file.

[] Toggle PR Review mode - this should show the diff vs the main branch, rather than the current function unstaged changes.

[] Possible to group by file and give them a shared faded 'background' that sits behind the nodes?