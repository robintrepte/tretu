import { getTranslations } from "next-intl/server"
import { Avatar } from "@/components/account/avatar"
import { SignOutButton } from "@/components/account/sign-out-button"
import { BrandMark } from "@/components/brand"

export async function AccountHeader({ name, image, username }: { name: string; image: string | null; username: string }) {
  const t = await getTranslations("common")
  return (
    <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <BrandMark />
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-tight">{name}</div>
            <div className="text-xs text-muted-foreground">@{username}</div>
          </div>
          <Avatar name={name} image={image} size={36} />
          <SignOutButton label={t("signOut")} />
        </div>
      </div>
    </header>
  )
}
