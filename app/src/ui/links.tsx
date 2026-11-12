// Author links shown in the app (home, editor status bar). An empty URL hides its icon.
import React from 'react';
import {BrandIcon, type Brand} from './icons';

export const AUTHOR_LINKS: {brand: Brand; label: string; url: string}[] = [
	{brand: 'youtube', label: 'YouTube', url: 'https://youtube.com/@briceiscoding'},
	{brand: 'tiktok', label: 'TikTok', url: 'https://tiktok.com/@briceiscoding'},
	{brand: 'instagram', label: 'Instagram', url: 'https://instagram.com/briceiscoding'},
	{brand: 'github', label: 'AutoShort on GitHub', url: 'https://github.com/briceiscoding/autoshort-public'},
];

// Links open in the usual browser (a new window, outside the app window).
export const SocialLinks: React.FC<{size?: number; withLabels?: boolean}> = ({size = 16, withLabels}) => {
	const links = AUTHOR_LINKS.filter((l) => l.url);
	if (!links.length) return null;
	return (
		<nav className="social-links" aria-label="Author links">
			{links.map((l) => (
				<a key={l.brand} href={l.url} target="_blank" rel="noopener noreferrer" title={l.label} className={`social ${l.brand}`}>
					<BrandIcon brand={l.brand} size={size} />
					{withLabels ? <span>{l.label}</span> : null}
				</a>
			))}
		</nav>
	);
};

// Free resources, suggested where the user needs a file (check each site's licence before publishing).
export const FREE_RESOURCES = {
	sfx: [
		{label: 'Pixabay', url: 'https://pixabay.com/sound-effects/'},
		{label: 'Mixkit', url: 'https://mixkit.co/free-sound-effects/'},
		{label: 'Freesound', url: 'https://freesound.org/'},
	],
	music: [
		{label: 'Pixabay', url: 'https://pixabay.com/music/'},
		{label: 'YouTube Audio Library', url: 'https://studio.youtube.com/channel/UC/music'},
	],
	pictures: [
		{label: 'Unsplash', url: 'https://unsplash.com/'},
		{label: 'Pexels', url: 'https://www.pexels.com/'},
		{label: 'Pixabay', url: 'https://pixabay.com/images/search/'},
	],
	broll: [
		{label: 'Pexels', url: 'https://www.pexels.com/videos/'},
		{label: 'Pixabay', url: 'https://pixabay.com/videos/'},
		{label: 'Mixkit', url: 'https://mixkit.co/free-stock-video/'},
	],
	logos: [
		{label: 'svgl', url: 'https://svgl.app/'},
		{label: 'Simple Icons', url: 'https://simpleicons.org/'},
	],
	subscribe: [{label: 'Pixabay (green screen)', url: 'https://pixabay.com/videos/search/subscribe%20green%20screen/'}],
	fonts: [{label: 'Google Fonts', url: 'https://fonts.google.com/'}],
} satisfies Record<string, {label: string; url: string}[]>;

export const FreeLinks: React.FC<{kind: keyof typeof FREE_RESOURCES; label?: string}> = ({kind, label = 'Free'}) => (
	<span className="free-links small">
		{label}:{' '}
		{FREE_RESOURCES[kind].map((r, i) => (
			<React.Fragment key={r.url}>
				{i ? ' · ' : null}
				<a href={r.url} target="_blank" rel="noopener noreferrer">
					{r.label}
				</a>
			</React.Fragment>
		))}
	</span>
);
