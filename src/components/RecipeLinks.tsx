import { Fragment } from 'react';
import { Link } from 'react-router';
import type { RecipeRef } from '../api/types';

/** "Tart base, Chantilly cream" with each name linking to the recipe. */
export function RecipeLinks({ recipes }: { recipes: RecipeRef[] }) {
  return (
    <>
      {recipes.map((recipe, index) => (
        <Fragment key={recipe.id}>
          {index > 0 && ', '}
          <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
        </Fragment>
      ))}
    </>
  );
}
