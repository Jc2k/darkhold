import { Link } from 'react-router-dom';

const tools = [
  {
    to: '/housekeeping/orphaned-ingredients',
    title: 'Clean orphaned ingredients',
    description:
      'Review and delete ingredients that are not used by a recipe or an active/recent shopping-list entry.',
  },
  {
    to: '/housekeeping/historic-cook-logs',
    title: 'Fix historic cook logs',
    description:
      'Preview old meal-plan entries that do not have a matching cook log, then create three-star historic logs.',
  },
  {
    to: '/housekeeping/recipe-creation-dates',
    title: 'Fix historic recipe creation dates',
    description:
      'Compare recipe creation timestamps with their earliest cook logs and preview corrections.',
  },
];

export function Housekeeping() {
  return (
    <div className="pt-2">
      <h1 className="h3">Housekeeping</h1>
      <p className="text-muted">
        Administrative tools for reviewing and correcting historic Tandoor data.
      </p>
      <ul className="ps-4">
        {tools.map((tool) => (
          <li key={tool.to} className="mb-3">
            <h2 className="h5 mb-1">
              <Link to={tool.to}>{tool.title}</Link>
            </h2>
            <div>{tool.description}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
