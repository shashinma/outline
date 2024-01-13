import { t } from "i18next";
import isNil from "lodash/isNil";
import orderBy from "lodash/orderBy";
import { observer } from "mobx-react";
import * as React from "react";
import { useHistory } from "react-router-dom";
import { toast } from "sonner";
import styled from "styled-components";
import { Pagination } from "@shared/constants";
import Document from "~/models/Document";
import User from "~/models/User";
import UserMembership from "~/models/UserMembership";
import Avatar from "~/components/Avatar";
import { AvatarSize } from "~/components/Avatar/Avatar";
import Combobox from "~/components/Combobox";
import Flex from "~/components/Flex";
import LoadingIndicator from "~/components/LoadingIndicator";
import useCurrentUser from "~/hooks/useCurrentUser";
import usePolicy from "~/hooks/usePolicy";
import useRequest from "~/hooks/useRequest";
import useStores from "~/hooks/useStores";
import useThrottledCallback from "~/hooks/useThrottledCallback";
import { homePath } from "~/utils/routeHelpers";
import MemberListItem from "./MemberListItem";

type Props = {
  /** Document to which team members are supposed to be invited */
  document: Document;
  /** Children to be rendered before the list of members */
  children?: React.ReactNode;
};

function DocumentMembersList({ document, children }: Props) {
  const { users, userMemberships } = useStores();
  const [query, setQuery] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null);
  const [invitedInSession, setInvitedInSession] = React.useState<string[]>([]);
  const user = useCurrentUser();
  const history = useHistory();
  const can = usePolicy(document);

  const { loading: loadingTeamMembers, request: fetchTeamMembers } = useRequest(
    React.useCallback(
      () => users.fetchPage({ limit: Pagination.defaultLimit }),
      [users]
    )
  );

  const { loading: loadingDocumentMembers, request: fetchDocumentMembers } =
    useRequest(
      React.useCallback(
        () =>
          userMemberships.fetchDocumentMemberships({
            id: document.id,
            limit: Pagination.defaultLimit,
          }),
        [userMemberships, document.id]
      )
    );

  React.useEffect(() => {
    void fetchTeamMembers();
    void fetchDocumentMembers();
  }, [fetchTeamMembers, fetchDocumentMembers]);

  const inviteUser = React.useCallback(
    (user: User) => {
      setInvitedInSession((prev) => [...prev, user.id]);
      return userMemberships.create({
        documentId: document.id,
        userId: user.id,
      });
    },
    [userMemberships, document.id]
  );

  const fetchUsersByQuery = useThrottledCallback(
    (query) =>
      users.fetchPage({
        query,
      }),
    250
  );

  const nonMembers = React.useMemo(
    () =>
      users.notInDocument(document.id, query).filter((u) => u.id !== user.id),
    [users, users.orderedData, document.id, document.members, user.id, query]
  );

  React.useEffect(() => {
    if (!isNil(query)) {
      void fetchUsersByQuery(query);
    }
  }, [query, fetchUsersByQuery]);

  React.useEffect(() => {
    if (selectedUser) {
      void inviteUser(selectedUser);
    }
  }, [selectedUser, inviteUser]);

  const handleQuery = (value: string) => {
    setQuery(value);
  };

  const handleSelect = (user: User) => {
    setSelectedUser(user);
  };

  const handleRemoveUser = React.useCallback(
    async (item) => {
      try {
        await userMemberships.delete({
          documentId: document.id,
          userId: item.id,
        } as UserMembership);

        if (item.id === user.id) {
          history.push(homePath());
        } else {
          toast.success(
            t(`{{ userName }} was removed from the document`, {
              userName: item.name,
            })
          );
        }
      } catch (err) {
        toast.error(t("Could not remove user"));
      }
    },
    [userMemberships, user, document]
  );

  const handleUpdateUser = React.useCallback(
    async (user, permission) => {
      try {
        await userMemberships.create({
          documentId: document.id,
          userId: user.id,
          permission,
        });
        toast.success(
          t(`Permissions for {{ userName }} updated`, {
            userName: user.name,
          })
        );
      } catch (err) {
        toast.error(t("Could not update user"));
      }
    },
    [userMemberships, document]
  );

  // Order newly added users first during the current editing session, on reload members are
  // ordered by name
  const members = React.useMemo(
    () =>
      orderBy(
        document.members,
        (user) =>
          (invitedInSession.includes(user.id) ? "_" : "") +
          user.name.toLowerCase(),
        "asc"
      ),
    [document.members, invitedInSession]
  );

  if (loadingTeamMembers || loadingDocumentMembers) {
    return <LoadingIndicator />;
  }

  return (
    <RelativeFlex column>
      {can.manageUsers && (
        <Combobox
          suggestions={nonMembers.map((user) => ({
            id: user.id,
            value: user.name,
            label: (
              <Flex align="center" gap={8}>
                <Avatar
                  model={user}
                  size={AvatarSize.Small}
                  showBorder={false}
                />
                <span>{user.name}</span>
              </Flex>
            ),
          }))}
          value={query}
          onChangeInput={handleQuery}
          onSelectOption={handleSelect}
          listLabel={t("Workspace members")}
          placeholder={`${t("Find by name")}…`}
          autoFocus
        />
      )}
      {children}
      {members.map((item) => (
        <MemberListItem
          key={item.id}
          user={item}
          membership={item.getMembership(document)}
          onRemove={() => handleRemoveUser(item)}
          onUpdate={
            can.manageUsers
              ? (permission) => handleUpdateUser(item, permission)
              : undefined
          }
          onLeave={
            item.id === user.id ? () => handleRemoveUser(item) : undefined
          }
        />
      ))}
    </RelativeFlex>
  );
}

const RelativeFlex = styled(Flex)`
  position: relative;
  margin-bottom: 12px;
`;

export default observer(DocumentMembersList);
