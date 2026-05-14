We are going to build a new website where users can look at the "transport cadence" ie. "how often can I get from stop A to stop B". What is see for me is a website with two searchable dropdowns where user can select stop A and stop B, and then the website shows how many times there is a trip for each hour 00, 01, .., 22, 23, by showind a bar chart.

I've downloaded the dataset from the Danish transportation platform Rejseplanen. It is GTFS format @GTFS. This should be a widely know dataformat.

I imagine that start by writing a script in TypeScript can ingest all the data into a SQLite database: .zip to .db. When ingesting the script should add primary keys and foreign keys, so data is quick to find by automatic indexes.

When we have the SQLite database, we then need a website. I was thinking for Next.js because I want the fronend in React v19, Tailwind and Shadcn for styling, TypeScript as language. Using Next.js we should be able to run SQL on the .db file server side and update the React application in an easy manner, without thinking about API interfaces. The theming for the Shadcn is found in the src/theme.css file. The theme originates from https://www.shadcn.studio/. 

Ask clarifying questions and let's start by writing the full specificaiton of the application in the SPEC.md file
