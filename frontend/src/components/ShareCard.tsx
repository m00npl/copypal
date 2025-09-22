import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TextForm } from "./TextForm"
import { FileForm } from "./FileForm"

interface ShareCardProps {
  onCreateLink: (data: { content?: string; file?: File; expiresAt: Date }) => Promise<void>
}

export function ShareCard({ onCreateLink }: ShareCardProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'file'>('text')

  const handleTextCreate = async (data: { content: string; expiresAt: Date }) => {
    await onCreateLink({ content: data.content, expiresAt: data.expiresAt })
  }

  const handleFileCreate = async (data: { file: File; expiresAt: Date }) => {
    await onCreateLink({ file: data.file, expiresAt: data.expiresAt })
  }

  return (
    <div className="bg-[#131A26]/50 backdrop-blur-sm border border-[#273244] rounded-2xl p-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'text' | 'file')}>
        <TabsList className="grid grid-cols-2 w-full mb-6 bg-[#0B0F1A] border border-[#273244]">
          <TabsTrigger
            value="text"
            className="data-[state=active]:bg-[#20C15A] data-[state=active]:text-white text-[#9AA7BD]"
          >
            Text
          </TabsTrigger>
          <TabsTrigger
            value="file"
            className="data-[state=active]:bg-[#20C15A] data-[state=active]:text-white text-[#9AA7BD]"
          >
            File
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-0">
          <TextForm onCreateLink={handleTextCreate} />
        </TabsContent>

        <TabsContent value="file" className="mt-0">
          <FileForm onCreateLink={handleFileCreate} />
        </TabsContent>
      </Tabs>
    </div>
  )
}